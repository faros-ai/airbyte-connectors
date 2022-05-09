import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Bitbucket} from '../bitbucket/bitbucket';
import {BitbucketConfig, PullRequest} from '../bitbucket/types';

type StreamSlice = {workspace: string; repository: string} | undefined;
type PullRequestState = {cutoff?: string} | undefined;

export class PullRequests extends AirbyteStreamBase {
  constructor(
    readonly config: BitbucketConfig,
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
    const bitbucket = Bitbucket.instance(this.config, this.logger);
    for (const workspace of this.config.workspaces) {
      for await (const repo of bitbucket.getRepositories(workspace)) {
        yield {workspace, repository: repo.slug};
      }
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
    const workspace = streamSlice.workspace;
    const repoSlug = streamSlice.repository;
    for (const pr of await bitbucket.getPullRequests(
      workspace,
      repoSlug,
      lastUpdated
    )) {
      yield pr;
    }
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
