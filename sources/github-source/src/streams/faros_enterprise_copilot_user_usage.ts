import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {EnterpriseCopilotUserUsage} from 'faros-airbyte-common/github';
import {Utils} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';

import {GitHub} from '../github';
import {
  EnterpriseStreamSlice,
  StreamBase,
  StreamState,
  StreamWithEnterpriseSlices,
} from './common';

export class FarosEnterpriseCopilotUserUsage extends StreamWithEnterpriseSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosEnterpriseCopilotUserUsage.json');
  }

  get primaryKey(): StreamKey {
    return ['enterprise', 'day', 'user_login'];
  }

  get supportsIncremental(): boolean {
    return true;
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: EnterpriseStreamSlice,
    streamState?: StreamState
  ): AsyncGenerator<EnterpriseCopilotUserUsage> {
    const github = await GitHub.instance(this.config, this.logger);
    const enterprise = streamSlice?.enterprise;
    const state = streamState?.[StreamBase.enterpriseKey(enterprise)];
    yield* github.getEnterpriseCopilotUserUsage(enterprise, state?.cutoff ?? 0);
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: EnterpriseCopilotUserUsage,
    slice: EnterpriseStreamSlice
  ): StreamState {
    const latestRecordCutoff = Utils.toDate(latestRecord?.day ?? 0);
    return this.getUpdatedStreamState(
      latestRecordCutoff,
      currentStreamState,
      StreamBase.enterpriseKey(slice.enterprise)
    );
  }
}
