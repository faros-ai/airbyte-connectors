import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Commit} from 'faros-airbyte-common/azure-devops';
import {Dictionary} from 'ts-essentials';

import {AzureRepos} from '../azure-repos';
import {
  BranchStreamSlice,
  BranchStreamState,
  StreamWithBranchSlices,
} from './common';

export class Commits extends StreamWithBranchSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/commits.json');
  }

  get primaryKey(): StreamKey {
    return 'commitId';
  }

  get cursorField(): string | string[] {
    return ['committer', 'date'];
  }

  getUpdatedState(
    currentStreamState: BranchStreamState,
    latestCommit: Commit
  ): BranchStreamState {
    return this.updateState(
      currentStreamState,
      latestCommit.branch,
      latestCommit.repository.name,
      latestCommit.repository.project.name,
      latestCommit.committer.date
    );
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: BranchStreamSlice,
    streamState?: BranchStreamState
  ): AsyncGenerator<Commit> {
    const azureRepos = await AzureRepos.instance(
      this.config,
      this.logger,
      this.config.branch_pattern,
      this.config.repositories,
      this.config.fetch_tags,
      this.config.fetch_branch_commits
    );

    const since = this.getCutoff(syncMode, streamSlice, streamState);
    yield* azureRepos.getCommits(
      streamSlice.branch,
      streamSlice.repository,
      since
    );
  }
}
