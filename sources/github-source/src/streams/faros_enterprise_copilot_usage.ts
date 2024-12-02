import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {EnterpriseCopilotUsageSummary} from 'faros-airbyte-common/github';
import {Utils} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';

import {GitHub} from '../github';
import {
  EnterpriseStreamSlice,
  StreamBase,
  StreamState,
  StreamWithEnterpriseSlices,
} from './common';

export class FarosEnterpriseCopilotUsage extends StreamWithEnterpriseSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosEnterpriseCopilotUsage.json');
  }

  get primaryKey(): StreamKey {
    return ['enterprise', 'team', 'day'];
  }

  get supportsIncremental(): boolean {
    return true;
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: EnterpriseStreamSlice,
    streamState?: StreamState
  ): AsyncGenerator<EnterpriseCopilotUsageSummary> {
    const github = await GitHub.instance(this.config, this.logger);
    const enterprise = streamSlice?.enterprise;
    const state = streamState?.[StreamBase.enterpriseKey(enterprise)];
    yield* github.getEnterpriseCopilotUsage(enterprise, state?.cutoff ?? 0);
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: EnterpriseCopilotUsageSummary,
    slice: EnterpriseStreamSlice
  ): StreamState {
    // ignore team usage records
    // get cutoff based on org usage record as it's the first request we make
    if (latestRecord.team) {
      return currentStreamState;
    }
    const latestRecordCutoff = Utils.toDate(latestRecord?.day ?? 0);
    return this.getUpdatedStreamState(
      latestRecordCutoff,
      currentStreamState,
      StreamBase.enterpriseKey(slice.enterprise)
    );
  }
}
