import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {LogEvent} from '../models';
import {Okta, OktaConfig} from '../okta';

interface LogEventState {
  lastPublishedAt: string;
}

export class LogEvents extends AirbyteStreamBase {
  constructor(
    private readonly config: OktaConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/log_events.json');
  }
  get primaryKey(): StreamKey {
    return ['uid', 'source'];
  }
  get cursorField(): string | string[] {
    return 'updated_at';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any>,
    streamState?: LogEventState
  ): AsyncGenerator<Dictionary<any, string>, any, unknown> {
    const LogEventState =
      syncMode === SyncMode.INCREMENTAL
        ? streamState?.lastPublishedAt
        : undefined;
    const okta = await Okta.instance(this.config, this.logger);
    yield* okta.getLogEvents(LogEventState);
  }

  getUpdatedState(
    currentStreamState: LogEventState,
    latestRecord: LogEvent
  ): LogEventState {
    const lastPublishedAt: Date = new Date(latestRecord.published);
    return {
      lastPublishedAt:
        lastPublishedAt > new Date(currentStreamState?.lastPublishedAt ?? 0)
          ? lastPublishedAt?.toISOString()
          : currentStreamState?.lastPublishedAt,
    };
  }
}
