import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {DateTime} from 'luxon';
import {Dictionary} from 'ts-essentials';

import {
  DEFAULT_CUTOFF_DAYS,
  LogEntry,
  Pagerduty,
  PagerdutyConfig,
} from '../pagerduty';

interface IncidentLogEntryState {
  lastSynced: string;
}

export class IncidentLogEntries extends AirbyteStreamBase {
  constructor(readonly config: PagerdutyConfig, logger: AirbyteLogger) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/incidentLogEntries.json');
  }
  get primaryKey(): StreamKey {
    return 'id';
  }
  get cursorField(): string | string[] {
    return 'created_at';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: LogEntry,
    streamState?: IncidentLogEntryState
  ): AsyncGenerator<LogEntry> {
    const pagerduty = Pagerduty.instance(this.config, this.logger);

    const now = DateTime.now();
    const lastSynced = streamState?.lastSynced;
    const cutoffTimestamp = now.minus({
      days: this.config.cutoff_days || DEFAULT_CUTOFF_DAYS,
    });
    const since = lastSynced
      ? DateTime.fromJSDate(new Date(lastSynced))
      : cutoffTimestamp;

    yield* pagerduty.getIncidentLogEntries(
      since,
      now,
      this.config.page_size,
      this.config.incident_log_entries_overview
    );
  }

  getUpdatedState(
    currentStreamState: IncidentLogEntryState,
    latestRecord: LogEntry
  ): IncidentLogEntryState {
    const currentState = new Date(currentStreamState.lastSynced ?? 0);
    const lastState = new Date(latestRecord.created_at);
    return {
      lastSynced:
        lastState > currentState
          ? latestRecord.created_at
          : currentStreamState.lastSynced,
    };
  }
}
