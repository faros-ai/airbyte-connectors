import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {LogEntry, Pagerduty, PagerdutyConfig} from '../pagerduty';

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

    const since =
      syncMode === SyncMode.INCREMENTAL ? streamState?.lastSynced : undefined;
    const until = new Date();

    yield* pagerduty.getIncidentLogEntries(
      since,
      until,
      this.config.pageSize,
      this.config.incidentLogEntriesOverview
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
