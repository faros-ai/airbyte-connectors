import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {EnterpriseCopilotSeatsStreamRecord} from 'faros-airbyte-common/github';
import {Dictionary} from 'ts-essentials';

import {GitHub} from '../github';
import {EnterpriseStreamSlice, StreamWithEnterpriseSlices} from './common';

export class FarosEnterpriseCopilotSeats extends StreamWithEnterpriseSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosEnterpriseCopilotSeats.json');
  }

  get primaryKey(): StreamKey {
    return ['enterprise', 'user'];
  }

  get supportsIncremental(): boolean {
    return true;
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: EnterpriseStreamSlice
  ): AsyncGenerator<EnterpriseCopilotSeatsStreamRecord> {
    const github = await GitHub.instance(this.config, this.logger);
    const enterprise = streamSlice?.enterprise;
    yield* github.getEnterpriseCopilotSeats(enterprise);
  }
}
