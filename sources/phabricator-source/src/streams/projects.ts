import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Phabricator, PhabricatorConfig, Project} from '../phabricator';

export interface ProjectsState {
  latestModifiedAt: number;
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
    return 'phid';
  }
  get cursorField(): string[] {
    return ['fields', 'dateModified'];
  }
  getUpdatedState(
    currentStreamState: ProjectsState,
    latestRecord: Project
  ): ProjectsState {
    const latestModified = currentStreamState?.latestModifiedAt ?? 0;
    const recordModified = latestRecord.fields?.dateModified ?? 0;
    currentStreamState.latestModifiedAt = Math.max(
      latestModified,
      recordModified
    );
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
    const modifiedAt = state?.latestModifiedAt ?? 0;

    yield* phabricator.getProjects({slugs: phabricator.projects}, modifiedAt);
  }
}
