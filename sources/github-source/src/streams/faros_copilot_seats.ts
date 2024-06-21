import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {CopilotSeat} from 'faros-airbyte-common/github';
import {Dictionary} from 'ts-essentials';

import {GitHub} from '../github';
import {OrgStreamSlice, StreamWithOrgSlices} from './common';

export class FarosCopilotSeats extends StreamWithOrgSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosCopilotSeats.json');
  }

  get primaryKey(): StreamKey {
    return ['org', 'user'];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: OrgStreamSlice
  ): AsyncGenerator<CopilotSeat> {
    const org = streamSlice?.org;
    const github = await GitHub.instance(this.config, this.logger, org);
    yield* github.getCopilotSeats(org, this.farosClient, this.config.graph);
  }
}
