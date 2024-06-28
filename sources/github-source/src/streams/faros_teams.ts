import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Team} from 'faros-airbyte-common/github';
import {Dictionary} from 'ts-essentials';

import {GitHub} from '../github';
import {OrgStreamSlice, StreamWithOrgSlices} from './common';

export class FarosTeams extends StreamWithOrgSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosTeams.json');
  }

  get primaryKey(): StreamKey {
    return ['org', 'slug'];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: OrgStreamSlice
  ): AsyncGenerator<Team> {
    const github = await GitHub.instance(this.config, this.logger);
    const org = streamSlice?.org;
    yield* github.getTeams(org);
  }
}
