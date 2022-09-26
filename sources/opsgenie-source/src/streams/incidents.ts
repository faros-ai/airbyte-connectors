import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Incident} from '../opsgenie/models';
import {OpsGenie, OpsGenieConfig} from '../opsgenie/opsgenie';
interface IncidentState {
  lastCreatedAt?: Date;
}
export class Incidents extends AirbyteStreamBase {
  constructor(
    private readonly config: OpsGenieConfig,
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
    return 'createdAt';
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
    const opsGenie = OpsGenie.instance(this.config, this.logger);
    yield* opsGenie.getIncidents(lastCreatedAt);
  }

  getUpdatedState(
    currentStreamState: IncidentState,
    latestRecord: Incident
  ): IncidentState {
    const lastCreatedAt = new Date(latestRecord.createdAt);
    return {
      lastCreatedAt:
        new Date(lastCreatedAt) >
        new Date(currentStreamState?.lastCreatedAt ?? 0)
          ? lastCreatedAt
          : currentStreamState?.lastCreatedAt,
    };
  }
}
