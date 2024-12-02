import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {EnterpriseTeam} from 'faros-airbyte-common/github';
import {Dictionary} from 'ts-essentials';

import {GitHub} from '../github';
import {EnterpriseStreamSlice, StreamWithEnterpriseSlices} from './common';

export class FarosEnterpriseTeams extends StreamWithEnterpriseSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosEnterpriseTeams.json');
  }

  get primaryKey(): StreamKey {
    return ['enterprise', 'slug'];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: EnterpriseStreamSlice
  ): AsyncGenerator<EnterpriseTeam> {
    const github = await GitHub.instance(this.config, this.logger);
    const enterprise = streamSlice?.enterprise;
    const teams = await github.getEnterpriseTeams(enterprise);
    for (const team of teams) {
      yield team;
    }
  }
}
