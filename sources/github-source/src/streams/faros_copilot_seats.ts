import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {CopilotSeatsStreamRecord} from 'faros-airbyte-common/github';
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

  get supportsIncremental(): boolean {
    return true;
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: OrgStreamSlice
  ): AsyncGenerator<CopilotSeatsStreamRecord> {
    const github = await GitHub.instance(this.config, this.logger);
    const org = streamSlice?.org;
    yield* github.getCopilotSeats(org);
  }
}
