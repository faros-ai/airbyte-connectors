import {AirbyteStreamBase, StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {DailyUsageItem} from 'faros-airbyte-common/cursor';
import {Utils} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';

import {Cursor} from '../cursor';
import {CursorConfig} from '../types';

type StreamState = {
  cutoff: number;
  minUsageDatePerEmail: {[email: string]: number};
};

export class DailyUsage extends AirbyteStreamBase {
  private minUsageDatePerEmail: {[email: string]: number};

  constructor(
    private readonly config: CursorConfig,
    protected readonly logger: any
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/dailyUsage.json');
  }

  get primaryKey(): StreamKey {
    return ['date', 'email'];
  }

  get cursorField(): string | string[] {
    return 'date';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any>,
    streamState?: StreamState
  ): AsyncGenerator<DailyUsageItem> {
    const cutoff = streamState?.cutoff;
    if (!this.minUsageDatePerEmail) {
      this.minUsageDatePerEmail = streamState?.minUsageDatePerEmail ?? {};
    }
    const [startDate, endDate] =
      syncMode === SyncMode.INCREMENTAL
        ? this.getUpdateRange(cutoff)
        : this.getUpdateRange();
    const cursor = Cursor.instance(this.config, this.logger);
    const dailyUsage = await cursor.getDailyUsage(
      startDate.getTime(),
      endDate.getTime()
    );
    for (const dailyUsageItem of dailyUsage) {
      if (!dailyUsageItem.email) {
        yield dailyUsageItem;
      } else {
        if (
          !this.minUsageDatePerEmail[dailyUsageItem.email] ||
          dailyUsageItem.date < this.minUsageDatePerEmail[dailyUsageItem.email]
        ) {
          this.minUsageDatePerEmail[dailyUsageItem.email] = dailyUsageItem.date;
        }
        yield {
          ...dailyUsageItem,
          minUsageDate: this.minUsageDatePerEmail[dailyUsageItem.email],
        };
      }
    }
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: DailyUsageItem
  ): StreamState {
    return {
      cutoff: Math.max(currentStreamState?.cutoff ?? 0, latestRecord.date),
      minUsageDatePerEmail: this.minUsageDatePerEmail,
    };
  }

  getUpdateRange(cutoff?: number): [Date, Date] {
    return [
      cutoff ? Utils.toDate(cutoff) : this.config.startDate,
      this.config.endDate,
    ];
  }
}
