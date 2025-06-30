import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {PullRequest} from 'faros-airbyte-common/azure-devops';
import {Dictionary} from 'ts-essentials';

import {AzureRepos, getQueryableDefaultBranch} from '../azure-repos';
import {RepoStreamSlice, RepoStreamState, StreamWithRepoSlices} from './common';

export class PullRequests extends StreamWithRepoSlices {
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
    currentStreamState: RepoStreamState,
    latestPR: PullRequest
  ): RepoStreamState {
    return this.updateState(
      currentStreamState,
      latestPR.repository.name,
      latestPR.repository.project.name,
      latestPR.closedDate
    );
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: RepoStreamSlice,
    streamState?: RepoStreamState
  ): AsyncGenerator<PullRequest> {
    const azureRepos = await AzureRepos.instance(
      this.config,
      this.logger,
      this.config.branch_pattern,
      this.config.repositories,
      this.config.fetch_tags,
      this.config.fetch_branch_commits
    );

    const since = this.getCutoff(syncMode, streamSlice, streamState);
    yield* azureRepos.getPullRequests(streamSlice.repository, since);
  }
}
