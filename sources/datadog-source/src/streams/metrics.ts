import {createHash} from 'crypto';
import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Datadog, MetricPoint} from '../datadog';

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
    for (const metric of this.datadog.config.metrics ?? []) {
      let from = 0;
      const queryHash = createHash('md5').update(metric.query).digest('hex');
      if (syncMode === SyncMode.INCREMENTAL) {
        from = streamState[queryHash] ?? 0;
      }
      const maxTo = from + this.datadog.config.metrics_max_window;
      const to = Math.min(Date.now().valueOf(), maxTo);
      yield* this.datadog.getMetrics(metric.query, queryHash, from, to);
    }
  }
}
