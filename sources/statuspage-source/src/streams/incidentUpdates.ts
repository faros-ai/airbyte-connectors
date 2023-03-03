import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Statuspage, StatuspageConfig} from '../statuspage';
import {IncidentUpdate} from '../types';

interface IncidentUpdatesState {
  cutoff: string;
}

export class IncidentUpdates extends AirbyteStreamBase {
  constructor(
    private readonly config: StatuspageConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/incidentUpdates.json');
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
    streamState?: IncidentUpdatesState
  ): AsyncGenerator<IncidentUpdate> {
    const statuspage = Statuspage.instance(this.config, this.logger);
    const state = syncMode === SyncMode.INCREMENTAL ? streamState : undefined;
    const cutoff: Date = state?.cutoff ? new Date(state?.cutoff) : undefined;

    yield* statuspage.getIncidentUpdates(cutoff);
  }

  getUpdatedState(
    currentStreamState: IncidentUpdatesState,
    latestRecord: IncidentUpdate
  ): IncidentUpdatesState {
    const currentState = new Date(currentStreamState?.cutoff ?? 0);
    const createdAt = new Date(latestRecord.created_at);
    const updatedAt = new Date(latestRecord.updated_at ?? 0);
    const lastState = createdAt > updatedAt ? createdAt : updatedAt;
    return {
      cutoff:
        lastState > currentState
          ? latestRecord.updated_at ?? latestRecord.created_at
          : currentStreamState?.cutoff,
    };
  }
}
