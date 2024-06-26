import {AirbyteLogger} from 'faros-airbyte-cdk';
import {FarosClient} from 'faros-js-client';

import {GitHub} from './github';
import {GitHubConfig} from './types';

export class OrgRepoFilter {
  orgs: Set<string> | undefined;

  constructor(
    private readonly config: GitHubConfig,
    private readonly logger: AirbyteLogger,
    private readonly farosClient?: FarosClient
  ) {}

  async getOrgs(): Promise<ReadonlyArray<string>> {
    if (!this.orgs) {
      this.orgs = new Set();
      const github = await GitHub.instance(this.config, this.logger);
      if (!this.config.orgs) {
        const orgs = await github.getOrganizations();
        for await (const org of orgs) {
          this.orgs.add(org);
        }
      } else {
        for (const org of this.config.orgs) {
          this.orgs.add(org);
        }
      }
    }
    return Array.from(this.orgs);
  }
}
