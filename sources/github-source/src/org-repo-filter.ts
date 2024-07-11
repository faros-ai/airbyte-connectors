import {AirbyteLogger} from 'faros-airbyte-cdk';
import {FarosClient} from 'faros-js-client';
import {toLower} from 'lodash';
import {Memoize} from 'typescript-memoize';

import {GitHub} from './github';
import {GitHubConfig} from './types';

type Repository = {
  name: string;
  defaultBranch: string;
};

export class OrgRepoFilter {
  organizations: Set<string> | undefined;
  repositoriesByOrg: Map<string, Set<Repository>> | undefined = new Map();

  constructor(
    private readonly config: GitHubConfig,
    private readonly logger: AirbyteLogger,
    private readonly farosClient?: FarosClient
  ) {}

  @Memoize()
  async getOrganizations(): Promise<ReadonlyArray<string>> {
    if (!this.organizations) {
      this.organizations = new Set();
      const github = await GitHub.instance(this.config, this.logger);
      if (!this.config.organizations) {
        const orgs = await github.getOrganizations();
        for await (const org of orgs) {
          this.organizations.add(org);
        }
      } else {
        for (const org of this.config.organizations) {
          this.organizations.add(toLower(org));
        }
      }
    }
    return Array.from(this.organizations);
  }

  @Memoize()
  async getRepositories(org: string): Promise<ReadonlyArray<Repository>> {
    if (!this.repositoriesByOrg.has(org)) {
      const repositories = new Set<Repository>();
      const github = await GitHub.instance(this.config, this.logger);
      // todo add repo filter based on config
      const repos = await github.getRepositories(org);
      for (const repo of repos) {
        repositories.add({name: repo.name, defaultBranch: repo.default_branch});
      }
      this.repositoriesByOrg.set(org, repositories);
    }
    return Array.from(this.repositoriesByOrg.get(org));
  }
}
