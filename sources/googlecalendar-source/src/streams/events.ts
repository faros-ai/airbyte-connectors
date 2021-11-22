import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {
  Event,
  EventsState,
  Googlecalendar,
  GoogleCalendarConfig,
} from '../googlecalendar';

export class Events extends AirbyteStreamBase {
  constructor(readonly config: GoogleCalendarConfig, logger: AirbyteLogger) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/events.json');
  }
  get primaryKey(): StreamKey {
    return 'id';
  }
  get cursorField(): string | string[] {
    return 'nextSyncToken';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any, string>,
    streamState?: EventsState
  ): AsyncGenerator<Event> {
    const googleCalendar = await Googlecalendar.instance(
      this.config,
      this.logger
    );
    const state = syncMode === SyncMode.INCREMENTAL ? streamState : {};

    yield* googleCalendar.getEvents(state);
  }

  getUpdatedState(
    currentStreamState: EventsState,
    latestRecord: Event
  ): EventsState {
    return {
      lastSyncToken:
        latestRecord?.nextSyncToken || currentStreamState.lastSyncToken,
    };
  }
}
