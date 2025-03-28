import {TeamProject} from 'azure-devops-node-api/interfaces/CoreInterfaces';
import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Repository} from 'faros-airbyte-common/azure-devops';
import {Dictionary} from 'ts-essentials';

import {AzureRepos} from '../azure-repos';
import {AzureReposStreamBase} from './common';

export class Repositories extends AzureReposStreamBase {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/repositories.json');
  }

  get primaryKey(): StreamKey {
    return 'id';
  }

  async *streamSlices(): AsyncGenerator<TeamProject> {
    const azureRepos = await AzureRepos.instance(this.config, this.logger);
    const projects = await azureRepos.getProjects(this.config.projects);
    yield* projects;
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: TeamProject
  ): AsyncGenerator<Repository> {
    this.logger.info(`Branch pattern: ${this.config.branch_pattern}`);
    const azureRepos = await AzureRepos.instance<AzureRepos>(
      this.config,
      this.logger,
      this.config.branch_pattern,
      this.config.repositories,
      this.config.fetch_tags,
      this.config.fetch_branch_commits
    );
    yield* azureRepos.getRepositories(streamSlice);
  }
}
