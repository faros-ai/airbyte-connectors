import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {TeamMembership} from 'faros-airbyte-common/github';
import {Dictionary} from 'ts-essentials';

import {GitHub} from '../github';
import {OrgStreamSlice, StreamWithOrgSlices} from './common';

export class FarosTeamMemberships extends StreamWithOrgSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosTeamMemberships.json');
  }

  get primaryKey(): StreamKey {
    return ['org', 'team', 'user'];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: OrgStreamSlice
  ): AsyncGenerator<TeamMembership> {
    const github = await GitHub.instance(this.config, this.logger);
    const org = streamSlice?.org;
    yield* github.getTeamMemberships(org);
  }
}
