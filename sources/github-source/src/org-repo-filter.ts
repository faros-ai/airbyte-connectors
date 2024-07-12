import {AirbyteLogger} from 'faros-airbyte-cdk';
import {Repository} from 'faros-airbyte-common/github';
import {Memoize} from 'typescript-memoize';

import {GitHub} from './github';
import {GitHubConfig} from './types';

export class OrgRepoFilter {
  organizations?: Set<string>;
  reposByOrg?: Map<string, Set<Repository>> = new Map();

  constructor(
    private readonly config: GitHubConfig,
    private readonly logger: AirbyteLogger
  ) {}

  @Memoize()
  async getOrganizations(): Promise<ReadonlyArray<string>> {
    if (!this.organizations) {
      const organizations = new Set<string>();
      const github = await GitHub.instance(this.config, this.logger);
      const visibleOrgs = await github.getOrganizations();
      if (!this.config.organizations) {
        for (const org of visibleOrgs) {
          if (!this.config.excluded_organizations?.includes(org)) {
            organizations.add(org);
          }
        }
      } else {
        for (const org of this.config.organizations) {
          if (!visibleOrgs.some((o) => o === org)) {
            this.logger.warn(`Skipping not found organization ${org}`);
            continue;
          }
          organizations.add(org);
        }
      }
      this.organizations = organizations;
    }
    return Array.from(this.organizations);
  }

  @Memoize()
  async getRepositories(org: string): Promise<ReadonlyArray<Repository>> {
    if (!this.reposByOrg.has(org)) {
      const repos = new Set<Repository>();
      const github = await GitHub.instance(this.config, this.logger);
      const visibleRepos = await github.getRepositories(org);
      if (!this.config.reposByOrg.has(org)) {
        for (const repo of visibleRepos) {
          if (!this.config.excludedReposByOrg.get(org)?.has(repo.name)) {
            repos.add(repo);
          }
        }
      } else {
        for (const repoName of this.config.reposByOrg.get(org)) {
          const repo = visibleRepos.find((r) => r.name === repoName);
          if (!repo) {
            this.logger.warn(
              `Skipping not found repository ${org}/${repoName}`
            );
            continue;
          }
          repos.add(repo);
        }
      }
      this.reposByOrg.set(org, repos);
    }
    return Array.from(this.reposByOrg.get(org));
  }
}
