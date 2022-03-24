import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {FireHydrant, FireHydrantConfig} from '../firehydrant/firehydrant';
import {Incident} from '../firehydrant/models';
interface IncidentState {
  lastCreatedAt?: Date;
}
export class Incidents extends AirbyteStreamBase {
  constructor(
    private readonly config: FireHydrantConfig,
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
    const lastCreatedAt =
      syncMode === SyncMode.INCREMENTAL
        ? new Date(streamState?.lastCreatedAt ?? 0)
        : undefined;
    const buildkite = FireHydrant.instance(this.config, this.logger);
    yield* buildkite.getIncidents(lastCreatedAt);
  }

  getUpdatedState(
    currentStreamState: IncidentState,
    latestRecord: Incident
  ): IncidentState {
    const lastCreatedAt = new Date(latestRecord.created_at);
    return {
      lastCreatedAt:
        new Date(lastCreatedAt) >
        new Date(currentStreamState?.lastCreatedAt ?? 0)
          ? lastCreatedAt
          : currentStreamState?.lastCreatedAt,
    };
  }
}
