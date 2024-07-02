import {AirbyteLogger} from 'faros-airbyte-cdk';
import {FarosClient} from 'faros-js-client';
import {toLower} from 'lodash';
import {Memoize} from 'typescript-memoize';

import {GitHub} from './github';
import {GitHubConfig} from './types';

export class OrgRepoFilter {
  organizations: Set<string> | undefined;

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
}
