import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Incident} from '../models';
import {Squadcast, SquadcastConfig} from '../squadcast';

interface IncidentState {
  lastUpdatedAt: string;
}

export class Incidents extends AirbyteStreamBase {
  constructor(
    private readonly config: SquadcastConfig,
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
    return 'created_at';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any>,
    streamState?: IncidentState
  ): AsyncGenerator<Incident> {
    const lastUpdatedAt =
      syncMode === SyncMode.INCREMENTAL
        ? streamState?.lastUpdatedAt
        : undefined;
    const squadcast = await Squadcast.instance(this.config, this.logger);
    yield* squadcast.getIncidents(lastUpdatedAt);
  }

  getUpdatedState(
    currentStreamState: IncidentState,
    latestRecord: Incident
  ): IncidentState {
    const createdAt = new Date(latestRecord.created_at);
    const acknowledgedAt = new Date(latestRecord.acknowledged_at);
    const resolvedAt = new Date(latestRecord.resolved_at);
    let lastUpdatedAt: Date =
      resolvedAt >= acknowledgedAt ? resolvedAt : acknowledgedAt;
    if (createdAt > lastUpdatedAt) {
      lastUpdatedAt = createdAt;
    }

    return {
      lastUpdatedAt:
        lastUpdatedAt > new Date(currentStreamState?.lastUpdatedAt ?? 0)
          ? lastUpdatedAt?.toISOString()
          : currentStreamState?.lastUpdatedAt,
    };
  }
}
