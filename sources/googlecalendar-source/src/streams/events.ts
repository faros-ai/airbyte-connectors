import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Event, Googlecalendar, GoogleCalendarConfig} from '../googlecalendar';

interface EventsState {
  lastSyncToken?: string;
}

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
    const syncToken =
      syncMode === SyncMode.INCREMENTAL
        ? streamState?.lastSyncToken
        : undefined;

    yield* googleCalendar.getEvents(syncToken);
  }

  getUpdatedState(
    currentStreamState: EventsState,
    latestRecord: Event
  ): EventsState {
    return {
      lastSyncToken:
        latestRecord?.nextSyncToken || currentStreamState?.lastSyncToken,
    };
  }
}
