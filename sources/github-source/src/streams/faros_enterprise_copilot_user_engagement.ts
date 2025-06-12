import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {EnterpriseCopilotUserEngagement} from 'faros-airbyte-common/github';
import {Utils} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';

import {GitHub} from '../github';
import {
  EnterpriseStreamSlice,
  StreamBase,
  StreamState,
  StreamWithEnterpriseSlices,
} from './common';

export class FarosEnterpriseCopilotUserEngagement extends StreamWithEnterpriseSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosEnterpriseCopilotUserEngagement.json');
  }

  get primaryKey(): StreamKey {
    return ['enterprise', 'date', 'login'];
  }

  get supportsIncremental(): boolean {
    return true;
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: EnterpriseStreamSlice,
    streamState?: StreamState
  ): AsyncGenerator<EnterpriseCopilotUserEngagement> {
    const github = await GitHub.instance(this.config, this.logger);
    const enterprise = streamSlice?.enterprise;
    const state = streamState?.[StreamBase.enterpriseKey(enterprise)];
    yield* github.getEnterpriseCopilotUserEngagement(
      enterprise,
      state?.cutoff ?? 0
    );
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: EnterpriseCopilotUserEngagement,
    slice: EnterpriseStreamSlice
  ): StreamState {
    const latestRecordCutoff = Utils.toDate(latestRecord?.date ?? 0);
    return this.getUpdatedStreamState(
      latestRecordCutoff,
      currentStreamState,
      StreamBase.enterpriseKey(slice.enterprise)
    );
  }
}
