import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {
  CopilotSeat,
  CopilotSeatsStreamRecord,
} from 'faros-airbyte-common/github';
import {Utils} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';

import {GitHub} from '../github';
import {
  OrgStreamSlice,
  RepoStreamSlice,
  StreamBase,
  StreamState,
  StreamWithOrgSlices,
} from './common';

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
    streamSlice?: OrgStreamSlice,
    streamState?: StreamState
  ): AsyncGenerator<CopilotSeatsStreamRecord> {
    const github = await GitHub.instance(this.config, this.logger);
    const org = streamSlice?.org;
    const state = streamState?.[StreamBase.orgKey(org)];
    // for Copilot data, cutoff default is beginning of time
    const cutoffDate = state?.cutoff
      ? Utils.toDate(state.cutoff)
      : Utils.toDate(0);
    yield* github.getCopilotSeats(org, cutoffDate);
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: CopilotSeatsStreamRecord,
    slice: RepoStreamSlice
  ): StreamState {
    if (latestRecord.empty) {
      return currentStreamState;
    }
    const seat = latestRecord as CopilotSeat;
    const latestRecordCutoff = Utils.toDate(seat?.createdAt ?? 0);
    return this.getUpdatedStreamState(
      latestRecordCutoff,
      currentStreamState,
      StreamBase.orgKey(slice.org)
    );
  }
}
