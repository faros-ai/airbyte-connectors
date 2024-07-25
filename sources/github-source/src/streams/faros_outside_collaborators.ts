import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {OutsideCollaborator} from 'faros-airbyte-common/lib/github';
import {Dictionary} from 'ts-essentials';

import {GitHub} from '../github';
import {OrgStreamSlice, StreamWithOrgSlices} from './common';

export class FarosOutsideCollaborators extends StreamWithOrgSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosOutsideCollaborators.json');
  }

  get primaryKey(): StreamKey {
    return 'login';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: OrgStreamSlice
  ): AsyncGenerator<OutsideCollaborator> {
    const org = streamSlice?.org;
    const github = await GitHub.instance(this.config, this.logger);
    yield* github.getOutsideCollaborators(org);
  }
}
