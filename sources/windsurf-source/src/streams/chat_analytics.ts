import {AirbyteLogger, StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {ChatAnalyticsItem, WindsurfConfig} from '../types';
import {Windsurf} from '../windsurf';
import {StreamWithUserSlices, UserStreamSlice, UserStreamState} from './common';

export class ChatAnalytics extends StreamWithUserSlices {
  constructor(config: WindsurfConfig, logger: AirbyteLogger) {
    super(config, logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/chatAnalytics.json');
  }

  get primaryKey(): StreamKey {
    return ['email', 'date', 'model_id', 'ide'];
  }

  get cursorField(): string | string[] {
    return 'date';
  }

  async *readRecords(
    syncMode: SyncMode,
    _cursorField?: string[],
    streamSlice?: UserStreamSlice,
    streamState?: UserStreamState
  ): AsyncGenerator<ChatAnalyticsItem> {
    const windsurf = Windsurf.instance(this.config, this.logger);
    const email = streamSlice?.email;
    const apiKey = streamSlice?.apiKey;

    if (!email || !apiKey) {
      return; // Skip if no email or apiKey
    }

    // For incremental sync, use the cutoff date from state for this specific email, otherwise use configured date range
    const emailState = this.getEmailState(streamState, email);
    const startDate = this.getStartDate(syncMode, emailState);
    const endDate = this.getEndDate();

    // Yield items directly from the async generator for this specific email
    yield* windsurf.getChatAnalytics(email, apiKey, startDate, endDate);
  }

  getUpdatedState(
    currentStreamState: UserStreamState,
    latestRecord: ChatAnalyticsItem,
    slice: UserStreamSlice
  ): UserStreamState {
    const email = slice.email;
    const currentEmailState = currentStreamState?.[email];
    const recordDate = latestRecord.date;

    // Update state with the latest date seen for this email
    if (!currentEmailState?.cutoff || recordDate > currentEmailState.cutoff) {
      return {
        ...currentStreamState,
        [email]: {
          cutoff: recordDate,
        },
      };
    }

    return currentStreamState;
  }
}
