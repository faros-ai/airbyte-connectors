import {AirbyteStreamBase, StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {DailyUsageItem} from 'faros-airbyte-common/cursor';
import {Utils} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';

import {Cursor} from '../cursor';
import {CursorConfig} from '../types';

type StreamState = {
  cutoff: number;
};

export class DailyUsage extends AirbyteStreamBase {
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
    const [startDate, endDate] =
      syncMode === SyncMode.INCREMENTAL
        ? this.getUpdateRange(cutoff)
        : this.getUpdateRange();
    const cursor = Cursor.instance(this.config, this.logger);
    yield* cursor.getDailyUsage(startDate.getTime(), endDate.getTime());
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: DailyUsageItem
  ): StreamState {
    return {
      cutoff: Math.max(currentStreamState?.cutoff ?? 0, latestRecord.date),
    };
  }

  getUpdateRange(cutoff?: number): [Date, Date] {
    return [
      cutoff ? Utils.toDate(cutoff) : this.config.startDate,
      this.config.endDate,
    ];
  }
}
