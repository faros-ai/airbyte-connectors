import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Bitbucket} from '../bitbucket/bitbucket';
import {BitbucketConfig, PullRequest} from '../bitbucket/types';

type StreamSlice = {repository?: string} | undefined;
type PullRequestState = {cutoff?: string} | undefined;

export class PullRequests extends AirbyteStreamBase {
  constructor(
    readonly config: BitbucketConfig,
    readonly repositories: string[],
    readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/pull_requests.json');
  }
  get primaryKey(): StreamKey {
    return 'id';
  }
  get cursorField(): string | string[] {
    return 'updatedOn';
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
    streamState?: Dictionary<any, string>
  ): AsyncGenerator<PullRequest> {
    const bitbucket = Bitbucket.instance(this.config, this.logger);

    const lastUpdated =
      syncMode === SyncMode.INCREMENTAL ? streamState?.cutoff : undefined;
    const repoSlug = streamSlice.repository;
    yield* bitbucket.getPullRequests(repoSlug, lastUpdated);
  }

  getUpdatedState(
    currentStreamState: PullRequestState,
    latestRecord: PullRequest
  ): PullRequestState {
    return {
      cutoff:
        new Date(latestRecord.updatedOn) >
        new Date(currentStreamState?.cutoff ?? 0)
          ? latestRecord.updatedOn
          : currentStreamState.cutoff,
    };
  }
}
