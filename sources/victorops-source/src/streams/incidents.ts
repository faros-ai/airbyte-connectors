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
  Victorops,
  VictoropsConfig,
  VictoropsState,
} from '../victorops';

export class Incidents extends AirbyteStreamBase {
  constructor(
    readonly config: VictoropsConfig,
    logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/incidents.json');
  }
  get primaryKey(): StreamKey {
    return 'incidentNumber';
  }
  get cursorField(): string | string[] {
    return ['startTime'];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Incident,
    streamState?: VictoropsState
  ): AsyncGenerator<Incident> {
    const victorops = Victorops.instance(this.config, this.logger);
    let state: Date | null = null;
    if (syncMode === SyncMode.INCREMENTAL) {
      const defaultCutoffDate = DateTime.now()
        .minus({days: DEFAULT_CUTOFF_DAYS})
        .toJSDate();
      state = streamState?.cutoff
        ? new Date(streamState.cutoff)
        : defaultCutoffDate;
    }

    yield* victorops.getIncidents(state);
  }

  getUpdatedState(
    currentStreamState: VictoropsState,
    latestRecord: Incident
  ): VictoropsState {
    const updatedAt = latestRecord.lastAlertTime || latestRecord.startTime;
    return {
      cutoff:
        currentStreamState.cutoff &&
        new Date(currentStreamState.cutoff) > new Date(updatedAt)
          ? currentStreamState.cutoff
          : updatedAt,
    };
  }
}
