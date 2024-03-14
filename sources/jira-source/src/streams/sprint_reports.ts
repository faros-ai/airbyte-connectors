import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';
import moment from 'moment/moment';
import {Dictionary} from 'ts-essentials';

import {
  DEFAULT_CUTOFF_DAYS,
  DEFAULT_CUTOFF_LAG_DAYS,
  Jira,
  JiraConfig,
  Project,
  SprintReport,
} from '../jira';
import {StreamSlice} from './common';

type StreamState = {
  readonly [project: string]: ProjectState;
};

export interface ProjectState {
  readonly issueCutoff?: number;
  readonly boards?: string[];
}

export class SprintReports extends AirbyteStreamBase {
  constructor(
    private readonly config: JiraConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/sprintReports.json');
  }

  get primaryKey(): StreamKey | undefined {
    return 'id';
  }

  get cursorField(): string | string[] {
    return ['id'];
  }

  async *streamSlices() {
    if (!this.config.projectKeys) {
      const jira = await Jira.instance(this.config, this.logger);
      for await (const project of jira.getProjects()) {
        yield {project: project.key};
      }
    }
    for (const project of this.config.projectKeys) {
      yield {project};
    }
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: StreamSlice,
    streamState?: StreamState
  ): AsyncGenerator<SprintReport> {
    const jira = await Jira.instance(this.config, this.logger);
    let projectsByKey: Map<string, Project>;
    if (!this.config.projectKeys) {
      projectsByKey = await jira.getProjectsByKey();
    }
    const projectKeys = this.config.projectKeys ?? projectsByKey.keys();
    for (const projectKey of projectKeys) {
      const project =
        projectsByKey?.get(projectKey) ?? (await jira.getProject(projectKey));
      for await (const board of jira.getBoards(project.id)) {
        if (this.config.boardIds && !this.config.boardIds.includes(board.id)) {
          this.logger.info(`Skipped board ${board.name} (id: ${board.id})`);
          continue;
        }
        const updateRange =
          syncMode === SyncMode.INCREMENTAL
            ? this.getUpdateRange(streamState, board.id)
            : undefined;
        for await (const report of jira.getSprintReports(
          board.id,
          updateRange
        )) {
          yield {
            ...report,
            projectKey: projectKey,
            boardId: board.id,
          };
        }
      }
    }
  }

  private getUpdateRange(
    projectState: ProjectState | undefined,
    boardId: string
  ): [Date, Date] {
    const newCutoff = moment().utc().toDate();
    // If no state with cutoff, use the default one applying cutoffDays
    const initialCutoff = moment()
      .utc()
      .subtract(this.config.cutoffDays || DEFAULT_CUTOFF_DAYS, 'days')
      .toDate();
    const fromCutoff = projectState?.issueCutoff
      ? Utils.toDate(projectState.issueCutoff)
      : initialCutoff;
    let range: [Date, Date] = [fromCutoff, newCutoff];
    // If the board is not in the state, use the default cutoff
    if (
      !projectState?.boards?.includes(boardId) &&
      initialCutoff < fromCutoff
    ) {
      range = [initialCutoff, newCutoff];
    }
    return range;
  }

  getUpdatedState(currentStreamState: StreamState, latestRecord: SprintReport) {
    const project = latestRecord.projectKey;
    const board = latestRecord.boardId;
    const currentBoards = currentStreamState[project]?.boards ?? [];
    const latestRecordCutoff = Utils.toDate(latestRecord.completedAt);
    const newCutoff = moment().utc().toDate();
    if (latestRecordCutoff > newCutoff) {
      const cutoffLag = moment
        .duration(this.config.cutoffLagDays || DEFAULT_CUTOFF_LAG_DAYS, 'days')
        .asMilliseconds();
      const newState: ProjectState = {
        issueCutoff: Math.max(
          latestRecordCutoff.getTime(),
          newCutoff.getTime() - cutoffLag
        ),
        boards: [...currentBoards, board],
      };
      return {
        ...currentStreamState,
        [project]: newState,
      };
    }
    return currentStreamState;
  }
}
