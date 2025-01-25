import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {EnterpriseTeamMembership} from 'faros-airbyte-common/github';
import {Dictionary} from 'ts-essentials';

import {GitHub} from '../github';
import {EnterpriseStreamSlice, StreamWithEnterpriseSlices} from './common';

export class FarosEnterpriseTeamMemberships extends StreamWithEnterpriseSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosEnterpriseTeamMemberships.json');
  }

  get primaryKey(): StreamKey {
    return [['enterprise'], ['team'], ['user_login']];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: EnterpriseStreamSlice
  ): AsyncGenerator<EnterpriseTeamMembership> {
    const github = await GitHub.instance(this.config, this.logger);
    const enterprise = streamSlice?.enterprise;
    yield* github.getEnterpriseTeamMemberships(enterprise);
  }
}
