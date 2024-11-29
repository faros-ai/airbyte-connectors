import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Commit, CopilotUsageSummary} from 'faros-airbyte-common/github';
import {Utils} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';

import {GitHub} from '../github';
import {
  OrgStreamSlice,
  StreamBase,
  StreamState,
  StreamWithOrgSlices,
} from './common';

export class FarosCopilotUsage extends StreamWithOrgSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosCopilotUsage.json');
  }

  get primaryKey(): StreamKey {
    return ['org', 'team', 'day'];
  }

  get supportsIncremental(): boolean {
    return true;
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: OrgStreamSlice,
    streamState?: StreamState
  ): AsyncGenerator<CopilotUsageSummary> {
    const github = await GitHub.instance(this.config, this.logger);
    const org = streamSlice?.org;
    const state = streamState?.[StreamBase.orgKey(org)];
    yield* github.getCopilotUsage(org, state?.cutoff ?? 0);
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: CopilotUsageSummary,
    slice: OrgStreamSlice
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
      StreamBase.orgKey(slice.org)
    );
  }
}
