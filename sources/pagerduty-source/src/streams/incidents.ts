import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Incident, Pagerduty, PagerdutyConfig} from '../pagerduty';

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

    const since =
      syncMode === SyncMode.INCREMENTAL ? streamState?.lastSynced : undefined;

    yield* pagerduty.getIncidents(since, this.config.page_size);
  }

  getUpdatedState(
    currentStreamState: IncidentState,
    latestRecord: Incident
  ): IncidentState {
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
