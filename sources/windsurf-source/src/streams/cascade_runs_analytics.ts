import {AirbyteLogger, StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {CascadeRunsItem, WindsurfConfig} from '../types';
import {Windsurf} from '../windsurf';
import {StreamWithUserSlices, UserStreamSlice,UserStreamState} from './common';

export class CascadeRunsAnalytics extends StreamWithUserSlices {
  constructor(config: WindsurfConfig, logger: AirbyteLogger) {
    super(config, logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/cascadeRunsAnalytics.json');
  }

  get primaryKey(): StreamKey {
    return ['email', 'day', 'model', 'mode', 'cascadeId'];
  }

  get cursorField(): string | string[] {
    return 'day';
  }

  async *readRecords(
    syncMode: SyncMode,
    _cursorField?: string[],
    streamSlice?: UserStreamSlice,
    streamState?: UserStreamState
  ): AsyncGenerator<CascadeRunsItem> {
    const windsurf = Windsurf.instance(this.config, this.logger);
    const email = streamSlice?.email;

    if (!email) {
      return; // Skip if no email
    }

    // For incremental sync, use the cutoff date from state for this specific email, otherwise use configured date range
    const emailState = this.getEmailState(streamState, email);
    const startDate = this.getStartDate(syncMode, emailState);
    const endDate = this.getEndDate();

    // Yield items directly from the async generator for this specific email
    yield* windsurf.getCascadeRunsAnalytics(email, startDate, endDate);
  }

  getUpdatedState(
    currentStreamState: UserStreamState,
    latestRecord: CascadeRunsItem,
    slice: UserStreamSlice
  ): UserStreamState {
    return this.updateStreamState(currentStreamState, latestRecord, slice);
  }
}
