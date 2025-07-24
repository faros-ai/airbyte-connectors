import {AirbyteStreamBase, StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {UsageEventItem} from 'faros-airbyte-common/cursor';
import {Utils} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';

import {Cursor} from '../cursor';
import {CursorConfig} from '../types';

type StreamState = {
  cutoff: number;
  minUsageTimestampPerEmail: {[email: string]: number};
};

export class UsageEvents extends AirbyteStreamBase {
  private minUsageTimestampPerEmail: {[email: string]: number};

  constructor(
    private readonly config: CursorConfig,
    protected readonly logger: any
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/usageEvents.json');
  }

  get primaryKey(): StreamKey {
    return ['timestamp', 'userEmail'];
  }

  get cursorField(): string | string[] {
    return 'timestamp';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any>,
    streamState?: StreamState
  ): AsyncGenerator<UsageEventItem> {
    const cutoff = streamState?.cutoff;
    if (!this.minUsageTimestampPerEmail) {
      this.minUsageTimestampPerEmail =
        streamState?.minUsageTimestampPerEmail ?? {};
    }
    const [startDate, endDate] =
      syncMode === SyncMode.INCREMENTAL
        ? this.getUpdateRange(cutoff)
        : this.getUpdateRange();
    const cursor = Cursor.instance(this.config, this.logger);
    const usageEvents = cursor.getUsageEvents(
      startDate.getTime(),
      endDate.getTime()
    );

    for await (const usageEvent of usageEvents) {
      if (
        !this.minUsageTimestampPerEmail[usageEvent.userEmail] ||
        Number(usageEvent.timestamp) <
          this.minUsageTimestampPerEmail[usageEvent.userEmail]
      ) {
        this.minUsageTimestampPerEmail[usageEvent.userEmail] = Number(
          usageEvent.timestamp
        );
      }
      yield {
        ...usageEvent,
        minUsageTimestamp: this.minUsageTimestampPerEmail[usageEvent.userEmail],
      };
    }
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: UsageEventItem
  ): StreamState {
    return {
      cutoff: Math.max(
        currentStreamState?.cutoff ?? 0,
        Number(latestRecord.timestamp)
      ),
      minUsageTimestampPerEmail: this.minUsageTimestampPerEmail,
    };
  }

  getUpdateRange(cutoff?: number): [Date, Date] {
    return [
      cutoff ? Utils.toDate(cutoff) : this.config.startDate,
      this.config.endDate,
    ];
  }
}
