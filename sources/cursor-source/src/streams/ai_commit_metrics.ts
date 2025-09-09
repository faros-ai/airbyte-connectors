import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {AiCommitMetricItem} from 'faros-airbyte-common/cursor';
import {Dictionary} from 'ts-essentials';

import {Cursor} from '../cursor';
import {CursorConfig} from '../types';

type StreamState = {
  cutoff: string;
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
    yield* cursor.getAiCommitMetrics(startDate, endDate);
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: AiCommitMetricItem
  ): StreamState {
    const currentCutoff = currentStreamState?.cutoff;
    const latestCommitCreatedAt = latestRecord.createdAt;

    if (!currentCutoff || latestCommitCreatedAt > currentCutoff) {
      return {cutoff: latestCommitCreatedAt};
    }
    return currentStreamState;
  }

  getUpdateRange(cutoff?: string): [string, string] {
    const startDate = cutoff || this.config.start_date || '7d';
    const endDate = this.config.end_date || 'now';
    return [startDate, endDate];
  }
}
