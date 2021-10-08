import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Phabricator, PhabricatorConfig, Project} from '../phabricator';

export interface ProjectsState {
  latestCreatedAt: number;
}

export class Projects extends AirbyteStreamBase {
  constructor(
    private readonly config: PhabricatorConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/projects.json');
  }
  get primaryKey(): StreamKey {
    throw 'phid';
  }
  get cursorField(): string[] {
    return ['fields', 'dateCreated'];
  }
  getUpdatedState(
    currentStreamState: ProjectsState,
    latestRecord: Project
  ): ProjectsState {
    const latestCreated = currentStreamState?.latestCreatedAt ?? 0;
    const recordCreated = latestRecord.fields?.dateCreated ?? 0;
    currentStreamState.latestCreatedAt = Math.max(latestCreated, recordCreated);
    return currentStreamState;
  }
  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any>,
    streamState?: ProjectsState
  ): AsyncGenerator<Project, any, any> {
    const phabricator = Phabricator.instance(this.config, this.logger);
    const state = syncMode === SyncMode.INCREMENTAL ? streamState : undefined;
    const createdAt = state?.latestCreatedAt ?? 0;

    yield* phabricator.getProjects({slugs: phabricator.projects}, createdAt);
  }
}
