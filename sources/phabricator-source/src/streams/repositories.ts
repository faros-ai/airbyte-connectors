import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Phabricator, PhabricatorConfig, Repository} from '../phabricator';

export interface RepositoriesState {
  latestModifiedAt: number;
}

export class Repositories extends AirbyteStreamBase {
  constructor(
    private readonly config: PhabricatorConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/repositories.json');
  }
  get primaryKey(): StreamKey {
    return 'phid';
  }
  get cursorField(): string[] {
    return ['fields', 'dateModified'];
  }
  getUpdatedState(
    currentStreamState: RepositoriesState,
    latestRecord: Repository
  ): RepositoriesState {
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
    streamState?: RepositoriesState
  ): AsyncGenerator<Repository, any, any> {
    const phabricator = Phabricator.instance(this.config, this.logger);
    const state = syncMode === SyncMode.INCREMENTAL ? streamState : undefined;
    const modifiedAt = state?.latestModifiedAt ?? 0;

    if (phabricator.repositories.length > 0) {
      this.logger.info(
        `Fetching repositories: ${phabricator.repositories.join(',')}`
      );
    }
    yield* phabricator.getRepositories(
      {repoNames: phabricator.repositories},
      modifiedAt
    );
  }
}
