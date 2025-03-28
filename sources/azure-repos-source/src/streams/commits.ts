import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Commit} from 'faros-airbyte-common/azure-devops';
import {Dictionary} from 'ts-essentials';

import {AzureRepos} from '../azure-repos';
import {AzureReposStreamBase} from './common';

export class Commits extends AzureReposStreamBase {
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
    currentStreamState: Dictionary<any>,
    latestCommit: Commit
  ): Dictionary<any> {
    return {
      cutoff:
        new Date(latestCommit.committer.date) >
        new Date(currentStreamState?.cutoff ?? 0)
          ? latestCommit.committer.date
          : currentStreamState.cutoff,
    };
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: any,
    streamState?: any
  ): AsyncGenerator<Commit> {
    const since =
      syncMode === SyncMode.INCREMENTAL ? streamState?.cutoff : undefined;

    const azureRepos = await AzureRepos.instance(
      this.config,
      this.logger,
      this.config.branch_pattern,
      this.config.repositories,
      this.config.fetch_tags,
      this.config.fetch_branch_commits
    );
    this.logger.debug(
      this.config.fetch_branch_commits
        ? `Fetching commits from branches matching pattern ${this.config.branch_pattern}`
        : `Fetching commits from default branch only`
    );
    // TODO: Should use project slices
    yield* azureRepos.getCommits(since, this.config.projects);
  }
}
