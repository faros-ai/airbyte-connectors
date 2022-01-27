import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Bitbucket} from '../bitbucket/bitbucket';
import {BitbucketConfig, Commit} from '../bitbucket/types';

type StreamSlice = {repository?: string} | undefined;
type CommitState = {cutoff?: string} | undefined;

export class Commits extends AirbyteStreamBase {
  constructor(
    readonly config: BitbucketConfig,
    readonly repositories: string[],
    readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/commits.json');
  }
  get primaryKey(): StreamKey {
    return 'hash';
  }
  get cursorField(): string | string[] {
    return 'date';
  }

  async *streamSlices(
    syncMode: SyncMode,
    cursorField?: string[],
    streamState?: Dictionary<any>
  ): AsyncGenerator<StreamSlice> {
    for (const repository of this.repositories) {
      yield {repository};
    }
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: StreamSlice,
    streamState?: CommitState
  ): AsyncGenerator<Commit> {
    const bitbucket = Bitbucket.instance(this.config, this.logger);

    const lastUpdated =
      syncMode === SyncMode.INCREMENTAL ? streamState?.cutoff : undefined;
    const repoSlug = streamSlice.repository;
    yield* bitbucket.getCommits(repoSlug, lastUpdated);
  }

  getUpdatedState(
    currentStreamState: CommitState,
    latestRecord: Commit
  ): CommitState {
    return {
      cutoff:
        new Date(latestRecord.date) > new Date(currentStreamState?.cutoff ?? 0)
          ? latestRecord.date
          : currentStreamState.cutoff,
    };
  }
}
