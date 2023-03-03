import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Statuspage, StatuspageConfig} from '../statuspage';
import {Incident} from '../types';

interface IncidentsState {
  cutoff: string;
}

export class Incidents extends AirbyteStreamBase {
  constructor(
    private readonly config: StatuspageConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/incidents.json');
  }
  get primaryKey(): StreamKey {
    return 'id';
  }
  get cursorField(): string | string[] {
    return 'updated_at';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any, string>,
    streamState?: IncidentsState
  ): AsyncGenerator<Incident> {
    const statuspage = Statuspage.instance(this.config, this.logger);
    const state = syncMode === SyncMode.INCREMENTAL ? streamState : undefined;
    const cutoff: Date = state?.cutoff ? new Date(state?.cutoff) : undefined;

    for (const incident of await statuspage.getIncidents(cutoff)) {
      yield incident;
    }
  }

  getUpdatedState(
    currentStreamState: IncidentsState,
    latestRecord: Incident
  ): IncidentsState {
    const lastUpdatedAt =
      new Date(latestRecord.resolved_at ?? 0) >
      new Date(latestRecord.updated_at)
        ? latestRecord.resolved_at
        : latestRecord.updated_at;

    return {
      cutoff:
        new Date(lastUpdatedAt) > new Date(currentStreamState?.cutoff ?? 0)
          ? lastUpdatedAt
          : currentStreamState?.cutoff,
    };
  }
}
