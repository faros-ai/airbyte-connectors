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
  Incident,
  Pagerduty,
  PagerdutyConfig,
} from '../pagerduty';

interface IncidentState {
  lastSynced: string;
}

export class Incidents extends AirbyteStreamBase {
  constructor(readonly config: PagerdutyConfig, logger: AirbyteLogger) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/incidents.json');
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
    streamSlice?: Incident,
    streamState?: IncidentState
  ): AsyncGenerator<Incident> {
    const pagerduty = Pagerduty.instance(this.config, this.logger);
    const state = syncMode === SyncMode.INCREMENTAL ? streamState : null;

    const now = DateTime.now();
    const cutoffTimestamp = now
      .minus({days: this.config.cutoffDays || DEFAULT_CUTOFF_DAYS})
      .toJSDate();
    let since = null;
    if (syncMode === SyncMode.INCREMENTAL) {
      since =
        state?.lastSynced !== undefined
          ? new Date(state.lastSynced)
          : cutoffTimestamp;
    }

    yield* pagerduty.getIncidents(since, this.config.pageSize);
  }

  getUpdatedState(
    currentStreamState: IncidentState,
    latestRecord: Incident
  ): IncidentState {
    const currentState = new Date(currentStreamState.lastSynced);
    const lastState = new Date(latestRecord.created_at);
    return {
      lastSynced:
        lastState > currentState
          ? latestRecord.created_at
          : currentStreamState.lastSynced,
    };
  }
}
