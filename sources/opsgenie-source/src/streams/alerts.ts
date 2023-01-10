import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Alert} from '../opsgenie/models';
import {OpsGenie, OpsGenieConfig} from '../opsgenie/opsgenie';
interface AlertState {
  lastCreatedAt?: Date;
}
export class Alerts extends AirbyteStreamBase {
  constructor(
    private readonly config: OpsGenieConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/alerts.json');
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
    streamState?: AlertState
  ): AsyncGenerator<Alert> {
    const lastCreatedAt =
      syncMode === SyncMode.INCREMENTAL
        ? new Date(streamState?.lastCreatedAt ?? 0)
        : undefined;
    const opsGenie = OpsGenie.instance(this.config, this.logger);
    yield* opsGenie.getAlerts(lastCreatedAt);
  }

  getUpdatedState(
    currentStreamState: AlertState,
    latestRecord: Alert
  ): AlertState {
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
