import {createHash} from 'crypto';
import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Datadog, MetricPoint} from '../datadog';

const DEFAULT_MAX_WINDOW = 604800000; // 7 days in milliseconds

export class Metrics extends AirbyteStreamBase {
  constructor(
    private readonly datadog: Datadog,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/metric.json');
  }

  get primaryKey(): StreamKey {
    return ['id'];
  }

  get cursorField(): string | string[] {
    return ['timestamp'];
  }

  getUpdatedState(
    currentStreamState: Dictionary<string, number>,
    latestRecord: MetricPoint
  ): Dictionary<string, number> {
    const queryHash = latestRecord.id.split('-')[0];
    return {...currentStreamState, [queryHash]: latestRecord.timestamp};
  }

  async *readRecords(
    syncMode: SyncMode,
    _cursorField?: string[],
    _streamSlice?: Dictionary<any, string>,
    streamState?: Dictionary<string, number>
  ): AsyncGenerator<Dictionary<any, string>, any, unknown> {
    for (const metricQuery of this.datadog.config.metrics ?? []) {
      const now = Date.now();
      let from =
        now - (this.datadog.config.metrics_max_window ?? DEFAULT_MAX_WINDOW);
      const queryHash = createHash('md5').update(metricQuery).digest('hex');
      if (syncMode === SyncMode.INCREMENTAL && queryHash in streamState) {
        from = streamState[queryHash];
      }
      yield* this.datadog.getMetrics(
        metricQuery,
        queryHash,
        from / 1000,
        now / 1000
      );
    }
  }
}
