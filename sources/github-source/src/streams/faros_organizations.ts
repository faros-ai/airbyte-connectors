import {StreamKey} from 'faros-airbyte-cdk';
import {Organization} from 'faros-airbyte-common/github';
import {Dictionary} from 'ts-essentials';

import {GitHub} from '../github';
import {StreamBase} from './common';

export class FarosOrganizations extends StreamBase {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosOrganizations.json');
  }

  get primaryKey(): StreamKey | undefined {
    return 'login';
  }

  async *readRecords(): AsyncGenerator<Organization> {
    const github = await GitHub.instance(this.config, this.logger);
    const orgs = await this.orgRepoFilter.getOrganizations();
    for (const org of orgs) {
      yield github.getOrganization(org);
    }
  }
}
