import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Bitbucket} from '../bitbucket/bitbucket';
import {BitbucketConfig, Repository} from '../bitbucket/types';

type RepositoryState = {cutoff?: string};

export class Repositories extends AirbyteStreamBase {
  constructor(
    readonly config: BitbucketConfig,
    readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/repositories.json');
  }
  get primaryKey(): StreamKey {
    return ['uuid'];
  }
  get cursorField(): string | string[] {
    return 'updatedOn';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any, string>,
    streamState?: Dictionary<any, string>
  ): AsyncGenerator<Repository> {
    const bitbucket = Bitbucket.instance(this.config, this.logger);

    const lastUpdated =
      syncMode === SyncMode.INCREMENTAL ? streamState?.cutoff : undefined;
    yield* bitbucket.getRepositories(lastUpdated);
  }

  getUpdatedState(
    currentStreamState: RepositoryState,
    latestRecord: Repository
  ): RepositoryState {
    return {
      cutoff:
        new Date(latestRecord.updatedOn) >
        new Date(currentStreamState?.cutoff ?? 0)
          ? latestRecord.updatedOn
          : currentStreamState.cutoff,
    };
  }
}
