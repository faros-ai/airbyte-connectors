import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Organization} from 'faros-airbyte-common/github';
import {Dictionary} from 'ts-essentials';

import {GitHub} from '../github';
import {OrgStreamSlice, StreamWithOrgSlices} from './common';

export class FarosOrganizations extends StreamWithOrgSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosOrganizations.json');
  }

  get primaryKey(): StreamKey | undefined {
    return 'login';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: OrgStreamSlice
  ): AsyncGenerator<Organization> {
    const org = streamSlice?.org;
    const github = await GitHub.instance(this.config, this.logger);
    yield github.getOrganization(org);
  }
}
