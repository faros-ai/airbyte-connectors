import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Incident} from '../servicenow/models';
import {ServiceNow} from '../servicenow/servicenow';

export interface IncidentsState {
  sys_updated_on: string;
}

export class Incidents extends AirbyteStreamBase {
  constructor(
    private readonly servicenow: ServiceNow,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/incident.json');
  }
  get primaryKey(): StreamKey {
    return ['sys_id', 'value'];
  }
  get cursorField(): string | string[] {
    return ['sys_updated_on', 'value'];
  }
  getUpdatedState(
    currentStreamState: IncidentsState,
    latestRecord: Incident
  ): IncidentsState {
    const latestModified = currentStreamState?.sys_updated_on
      ? new Date(currentStreamState.sys_updated_on).getTime()
      : 0;
    const recordModified = latestRecord?.sys_updated_on
      ? new Date(latestRecord.sys_updated_on).getTime()
      : 0;
    return {
      sys_updated_on: new Date(
        Math.max(latestModified, recordModified)
      ).toISOString(),
    };
  }

  async *readRecords(
    syncMode: SyncMode,
    _cursorField?: string[],
    _streamSlice?: Dictionary<any, string>,
    streamState?: IncidentsState
  ): AsyncGenerator<Dictionary<any, string>, any, unknown> {
    const state = syncMode === SyncMode.INCREMENTAL ? streamState : undefined;
    yield* this.servicenow.getIncidents(state?.sys_updated_on);
  }
}
