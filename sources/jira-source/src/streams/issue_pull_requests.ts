import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';
import moment from 'moment';
import {Dictionary} from 'ts-essentials';

import {
  DEFAULT_CUTOFF_DAYS,
  DEFAULT_CUTOFF_LAG_DAYS,
  DEV_FIELD_NAME,
  Jira,
  JiraConfig,
} from '../jira';
import {PullRequest} from '../models';
import {
  ProjectState,
  StreamSlice,
  StreamState,
  StreamWithProjectSlices,
} from './common';

export class IssuePullRequests extends StreamWithProjectSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/issuePullRequests.json');
  }

  get primaryKey(): StreamKey | undefined {
    return undefined;
  }

  get cursorField(): string | string[] {
    return ['issue', 'updated'];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: StreamSlice,
    streamState?: StreamState
  ): AsyncGenerator<PullRequest> {
    const jira = await Jira.instance(this.config, this.logger);
    const projectKeys =
      this.config.projectKeys ?? (await jira.getProjectsByKey()).keys();
    for (const projectKey of projectKeys) {
      const updateRange =
        syncMode === SyncMode.INCREMENTAL
          ? this.getUpdateRange(streamState?.[projectKey])
          : undefined;
      for await (const issue of jira.getIssues(
        projectKey,
        true,
        updateRange,
        true,
        true,
        [DEV_FIELD_NAME]
      )) {
        for (const pullRequest of issue.pullRequests || []) {
          yield {
            issue: {
              key: issue.key,
              updated: issue.updated,
              project: projectKey,
            },
            ...pullRequest,
          };
        }
      }
    }
  }

  private getUpdateRange(projectState: ProjectState): [Date, Date] {
    const newCutoff = moment().utc().toDate();
    // If no state with cutoff, use the default one applying cutoffDays
    const fromCutoff = projectState?.issueCutoff
      ? Utils.toDate(projectState.issueCutoff)
      : moment()
          .utc()
          .subtract(this.config.cutoffDays || DEFAULT_CUTOFF_DAYS, 'days')
          .toDate();
    return [fromCutoff, newCutoff];
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: PullRequest
  ): StreamState {
    const projectKey = latestRecord.issue.project;
    const currentCutoff = Utils.toDate(
      currentStreamState?.[projectKey]?.issueCutoff
    );
    const latestRecordCutoff = Utils.toDate(latestRecord.issue.updated);
    const newCutoff = moment().utc().toDate();
    if (latestRecordCutoff > currentCutoff) {
      const cutoffLag = moment
        .duration(this.config.cutoffLagDays || DEFAULT_CUTOFF_LAG_DAYS, 'days')
        .asMilliseconds();
      const newState: ProjectState = {
        issueCutoff: Math.max(
          latestRecordCutoff.getTime(),
          newCutoff.getTime() - cutoffLag
        ),
      };
      return {
        ...currentStreamState,
        [projectKey]: newState,
      };
    }
    return currentStreamState;
  }
}
