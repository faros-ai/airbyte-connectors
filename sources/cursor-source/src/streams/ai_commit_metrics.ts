import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {AiCommitMetricItem} from 'faros-airbyte-common/cursor';
import {Utils} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';

import {Cursor} from '../cursor';
import {CursorConfig} from '../types';

type StreamState = {
  cutoff: number;
};

export class AiCommitMetrics extends AirbyteStreamBase {
  constructor(
    private readonly config: CursorConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/aiCommitMetrics.json');
  }

  get primaryKey(): StreamKey {
    return ['commitHash', 'userEmail'];
  }

  get cursorField(): string | string[] {
    return 'createdAt';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any>,
    streamState?: StreamState
  ): AsyncGenerator<AiCommitMetricItem> {
    const cutoff = streamState?.cutoff;
    const [startDate, endDate] =
      syncMode === SyncMode.INCREMENTAL
        ? this.getUpdateRange(cutoff)
        : this.getUpdateRange();
    const cursor = Cursor.instance(this.config, this.logger);
    yield* cursor.getAiCommitMetrics(startDate.getTime(), endDate.getTime());
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: AiCommitMetricItem
  ): StreamState {
    return {
      cutoff: Math.max(
        currentStreamState?.cutoff ?? 0,
        Utils.toDate(latestRecord.createdAt)?.getTime()
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
