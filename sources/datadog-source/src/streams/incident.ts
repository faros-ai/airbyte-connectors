import {v2} from '@datadog/datadog-api-client';
import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Datadog} from '../datadog';

export interface IncidentsState {
  lastModified: Date;
}

export class Incidents extends AirbyteStreamBase {
  constructor(
    private readonly datadog: Datadog,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/incident.json');
  }
  get primaryKey(): StreamKey {
    return ['id'];
  }
  get cursorField(): string | string[] {
    return ['modified'];
  }
  getUpdatedState(
    currentStreamState: IncidentsState,
    latestRecord: v2.IncidentResponseData
  ): IncidentsState {
    const latestModified = currentStreamState?.lastModified
      ? new Date(currentStreamState.lastModified).getTime()
      : 0;
    const recordModified = latestRecord?.attributes?.modified
      ? new Date(latestRecord.attributes.modified).getTime()
      : 0;
    return {
      lastModified: new Date(Math.max(latestModified, recordModified)),
    };
  }

  async *readRecords(
    syncMode: SyncMode,
    _cursorField?: string[],
    _streamSlice?: Dictionary<any, string>,
    streamState?: IncidentsState
  ): AsyncGenerator<Dictionary<any, string>, any, unknown> {
    const state = syncMode === SyncMode.INCREMENTAL ? streamState : undefined;
    yield* this.datadog.getIncidents(state?.lastModified);
  }
}
