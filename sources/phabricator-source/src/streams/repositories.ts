import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Phabricator, PhabricatorConfig, Repository} from '../phabricator';

export interface RepositoriesState {
  latestCreatedAt: number;
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
    throw 'phid';
  }
  get cursorField(): string[] {
    return ['fields', 'dateCreated'];
  }
  getUpdatedState(
    currentStreamState: RepositoriesState,
    latestRecord: Repository
  ): RepositoriesState {
    const latestCreated = currentStreamState?.latestCreatedAt ?? 0;
    const recordCreated = latestRecord.fields?.dateCreated ?? 0;
    currentStreamState.latestCreatedAt = Math.max(latestCreated, recordCreated);
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
    const createdAt = state?.latestCreatedAt ?? 0;

    if (phabricator.repositories.length > 0) {
      this.logger.info(
        `Fetching repositories: ${phabricator.repositories.join(',')}`
      );
    }
    yield* phabricator.getRepositories(
      {repoNames: phabricator.repositories},
      createdAt
    );
  }
}
