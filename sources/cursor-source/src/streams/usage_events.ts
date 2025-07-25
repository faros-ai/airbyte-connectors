import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {UsageEventItem} from 'faros-airbyte-common/cursor';
import {Utils} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';

import {Cursor} from '../cursor';
import {CursorConfig} from '../types';

type StreamState = {
  cutoff: number;
};

export class UsageEvents extends AirbyteStreamBase {
  constructor(
    private readonly config: CursorConfig,
    protected readonly logger: AirbyteLogger
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
    const [startDate, endDate] =
      syncMode === SyncMode.INCREMENTAL
        ? this.getUpdateRange(cutoff)
        : this.getUpdateRange();
    const cursor = Cursor.instance(this.config, this.logger);
    const usageEvents = cursor.getUsageEvents(
      startDate.getTime(),
      endDate.getTime()
    );
    yield* usageEvents;
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
    };
  }

  getUpdateRange(cutoff?: number): [Date, Date] {
    return [
      cutoff ? Utils.toDate(cutoff) : this.config.startDate,
      this.config.endDate,
    ];
  }
}
