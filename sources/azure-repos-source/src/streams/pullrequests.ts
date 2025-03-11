import {PullRequestStatus} from 'azure-devops-node-api/interfaces/GitInterfaces';
import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {AzureDevOpsStreamBase} from 'faros-airbyte-common/azure-devops';
import {Dictionary} from 'ts-essentials';

import {AzureRepos} from '../azure-repos';
import {PullRequest} from '../models';

export class PullRequests extends AzureDevOpsStreamBase {
  // Run commits stream first to get the changeCounts for populating
  // vcs_PullRequest.diffStats
  get dependencies(): string[] {
    return ['commits'];
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

    if (latestPR.status === PullRequestStatus.Completed) {
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

    const azureRepos = await AzureRepos.instance<AzureRepos>(
      this.config,
      this.logger
    );
    // TODO: Should use project slices or repository slices
    yield* azureRepos.getPullRequests(since, this.config.projects);
  }
}
