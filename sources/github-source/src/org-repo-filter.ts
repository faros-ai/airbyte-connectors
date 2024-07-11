import {AirbyteLogger} from 'faros-airbyte-cdk';
import {Memoize} from 'typescript-memoize';

import {GitHub} from './github';
import {GitHubConfig} from './types';

export class OrgRepoFilter {
  organizations?: Set<string>;
  reposByOrg?: Map<string, Set<string>> = new Map();

  constructor(
    private readonly config: GitHubConfig,
    private readonly logger: AirbyteLogger
  ) {}

  @Memoize()
  async getOrganizations(): Promise<ReadonlyArray<string>> {
    if (!this.organizations) {
      const organizations = new Set<string>();
      const github = await GitHub.instance(this.config, this.logger);
      if (!this.config.organizations) {
        for (const org of await github.getOrganizations()) {
          if (!this.config.excluded_organizations?.includes(org)) {
            organizations.add(org);
          }
        }
      } else {
        for (const org of this.config.organizations) {
          organizations.add(org);
        }
      }
      this.organizations = organizations;
    }
    return Array.from(this.organizations);
  }

  @Memoize()
  async getRepositories(org: string): Promise<ReadonlyArray<string>> {
    if (!this.reposByOrg.has(org)) {
      const repos = new Set<string>();
      const github = await GitHub.instance(this.config, this.logger);
      if (!this.config.reposByOrg.has(org)) {
        for (const repo of await github.getRepositories(org)) {
          if (!this.config.excludedReposByOrg.get(org)?.has(repo.name)) {
            repos.add(repo.name);
          }
        }
      } else {
        for (const repo of this.config.reposByOrg.get(org)) {
          repos.add(repo);
        }
      }
      this.reposByOrg.set(org, repos);
    }
    return Array.from(this.reposByOrg.get(org));
  }
}
