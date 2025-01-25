import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {SamlSsoUser} from 'faros-airbyte-common/github';
import {Dictionary} from 'ts-essentials';

import {GitHub} from '../github';
import {OrgStreamSlice, StreamWithOrgSlices} from './common';

export class FarosSamlSsoUsers extends StreamWithOrgSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosSamlSsoUsers.json');
  }

  get primaryKey(): StreamKey {
    return [['org'], ['user_login']];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: OrgStreamSlice
  ): AsyncGenerator<SamlSsoUser> {
    const org = streamSlice?.org;
    const github = await GitHub.instance(this.config, this.logger);
    yield* github.getSamlSsoUsers(org);
  }
}
