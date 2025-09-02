import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {CascadeLinesItem, WindsurfConfig} from '../types';
import {Windsurf} from '../windsurf';

export type EmailStreamSlice = {
  email: string;
};

export type StreamState = {
  readonly [email: string]: {
    cutoff: string;
  };
};

export class CascadeLinesAnalytics extends AirbyteStreamBase {
  constructor(
    private readonly config: WindsurfConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
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

  async *streamSlices(): AsyncGenerator<EmailStreamSlice> {
    const windsurf = Windsurf.instance(this.config, this.logger);
    const users = await windsurf.getUserPageAnalytics();

    for (const user of users) {
      if (user.email) {
        yield {email: user.email};
      }
    }
  }

  async *readRecords(
    syncMode: SyncMode,
    _cursorField?: string[],
    streamSlice?: EmailStreamSlice,
    streamState?: StreamState
  ): AsyncGenerator<CascadeLinesItem> {
    const windsurf = Windsurf.instance(this.config, this.logger);
    const email = streamSlice?.email;

    if (!email) {
      return; // Skip if no email
    }

    // For incremental sync, use the cutoff date from state for this specific email
    const emailState = streamState?.[email];
    const startDate =
      syncMode === SyncMode.INCREMENTAL && emailState?.cutoff
        ? emailState.cutoff
        : undefined;

    // Yield items directly from the async generator for this specific email
    yield* windsurf.getCascadeLinesAnalyticsForEmail(email, startDate);
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: CascadeLinesItem,
    slice: EmailStreamSlice
  ): StreamState {
    const email = slice.email;
    const currentEmailState = currentStreamState?.[email];
    const recordDate = latestRecord.day;

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
