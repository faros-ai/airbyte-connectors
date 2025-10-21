import {AirbyteLogger, StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {CascadeLinesItem, WindsurfConfig} from '../types';
import {Windsurf} from '../windsurf';
import {StreamWithUserSlices, UserStreamSlice, UserStreamState} from './common';

export class CascadeLinesAnalytics extends StreamWithUserSlices {
  constructor(config: WindsurfConfig, logger: AirbyteLogger) {
    super(config, logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/cascadeLinesAnalytics.json');
  }

  get primaryKey(): StreamKey {
    return ['email', 'day'];
  }

  get cursorField(): string | string[] {
    return 'day';
  }

  async *readRecords(
    syncMode: SyncMode,
    _cursorField?: string[],
    streamSlice?: UserStreamSlice,
    streamState?: UserStreamState
  ): AsyncGenerator<CascadeLinesItem> {
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
    yield* windsurf.getCascadeLinesAnalytics(email, startDate, endDate);
  }

  getUpdatedState(
    currentStreamState: UserStreamState,
    latestRecord: CascadeLinesItem,
    slice: UserStreamSlice
  ): UserStreamState {
    return this.updateStreamState(currentStreamState, latestRecord, slice);
  }
}
