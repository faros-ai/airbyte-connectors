import {AirbyteLogger, AirbyteStreamBase, SyncMode} from 'faros-airbyte-cdk';
import {Incident} from 'faros-airbyte-common/wolken';
import {Utils} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';

import {Wolken, WolkenConfig} from '../wolken';

export type StreamState = {
  cutoff: number;
};

export class Incidents extends AirbyteStreamBase {
  constructor(
    private readonly config: WolkenConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/incidents.json');
  }

  get primaryKey(): string {
    return 'ticketId';
  }

  get cursorField(): string {
    return 'updatedTimestamp';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: any,
    streamState?: StreamState
  ): AsyncGenerator<Incident> {
    const wolken = Wolken.instance(this.config, this.logger);
    const cutoff = streamState?.cutoff;
    const [start, end] =
      syncMode === SyncMode.INCREMENTAL
        ? this.getUpdateRange(cutoff)
        : this.getUpdateRange();
    yield* wolken.getIncidents(start, end);
  }

  getUpdateRange(cutoff?: number): [Date, Date] {
    return [
      cutoff ? Utils.toDate(cutoff) : this.config.startDate,
      this.config.endDate,
    ];
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: Incident
  ): StreamState {
    const latestRecordCutoff = Utils.toDate(
      latestRecord?.updatedTimestamp ?? 0
    );
    return {
      cutoff: Math.max(
        currentStreamState.cutoff ?? 0,
        latestRecordCutoff.getTime()
      ),
    };
  }
}
