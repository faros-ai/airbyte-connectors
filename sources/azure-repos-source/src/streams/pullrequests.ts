import {Dictionary} from 'ts-essentials';

import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from '../../../../faros-airbyte-cdk/lib';
import {AzureRepoConfig, AzureRepos} from '../azure-repos';
import {PullRequest} from '../models';

export class PullRequests extends AirbyteStreamBase {
  constructor(
    private readonly config: AzureRepoConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/pullrequests.json');
  }

  get primaryKey(): StreamKey {
    return 'pullRequestId';
  }

  get cursorField(): string | string[] {
    return 'closedDate';
  }

  getUpdatedState(
    currentStreamState: Dictionary<any>,
    latestPR: PullRequest
  ): Dictionary<any> {
    const newStreamState = currentStreamState;

    if (latestPR.status === 'completed') {
      return {
        cutoff:
          new Date(latestPR.closedDate) >
          new Date(currentStreamState?.cutoff ?? 0)
            ? latestPR.closedDate
            : currentStreamState.cutoff,
      };
    }

    return newStreamState;
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: any,
    streamState?: any
  ): AsyncGenerator<PullRequest> {
    const since =
      syncMode === SyncMode.INCREMENTAL ? streamState?.cutoff : undefined;

    const azureRepos = await AzureRepos.make(this.config, this.logger);
    yield* azureRepos.getPullRequests(since);
  }
}
