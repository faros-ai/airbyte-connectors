import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {
  DEFAULT_CALENDAR_ID,
  Event,
  Googlecalendar,
  GoogleCalendarConfig,
} from '../googlecalendar';

type StreamSlice = {calendarId: string};
interface EventsState {
  [calendarId: string]: {lastSyncToken?: string};
}

export class Events extends AirbyteStreamBase {
  constructor(
    readonly config: GoogleCalendarConfig,
    logger: AirbyteLogger
  ) {
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

  async *streamSlices(): AsyncGenerator<StreamSlice> {
    const calendars = this.config.calendar_ids ?? [DEFAULT_CALENDAR_ID];
    for (const calendarId of calendars) {
      yield {calendarId};
    }
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField: string[],
    streamSlice: StreamSlice,
    streamState?: EventsState
  ): AsyncGenerator<Event> {
    const calendarId = streamSlice.calendarId;
    if (calendarId) {
      const googleCalendar = await Googlecalendar.instance(
        this.config,
        this.logger,
        calendarId
      );
      const syncToken =
        syncMode === SyncMode.INCREMENTAL
          ? streamState?.[calendarId]?.lastSyncToken
          : undefined;

      yield* googleCalendar.getEvents(syncToken);
    }
  }

  getUpdatedState(
    currentStreamState: EventsState,
    latestRecord: Event
  ): EventsState {
    if (latestRecord?.calendarId && latestRecord?.nextSyncToken) {
      return {
        ...currentStreamState,
        [latestRecord.calendarId]: {lastSyncToken: latestRecord?.nextSyncToken},
      };
    }
    return currentStreamState;
  }
}
