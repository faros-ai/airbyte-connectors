import {AirbyteLogger, AirbyteStreamBase} from 'faros-airbyte-cdk';
import {FarosClient} from 'faros-js-client';

import {OrgRepoFilter} from '../org-repo-filter';
import {GitHubConfig} from '../types';

export type OrgStreamSlice = {
  org: string;
};

export abstract class StreamBase extends AirbyteStreamBase {
  readonly orgRepoFilter: OrgRepoFilter;
  constructor(
    protected readonly config: GitHubConfig,
    protected readonly logger: AirbyteLogger,
    protected readonly farosClient?: FarosClient
  ) {
    super(logger);
    this.orgRepoFilter = new OrgRepoFilter(config, logger, farosClient);
  }
}

export abstract class StreamWithOrgSlices extends StreamBase {
  async *streamSlices(): AsyncGenerator<OrgStreamSlice> {
    for (const org of await this.orgRepoFilter.getOrgs()) {
      yield {org};
    }
  }
}
