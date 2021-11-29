import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {
  CalendarListEntry,
  Googlecalendar,
  GoogleCalendarConfig,
} from '../googlecalendar';

interface CalendarListEntriesState {
  lastSyncToken: string;
}

export class CalendarListEntries extends AirbyteStreamBase {
  constructor(readonly config: GoogleCalendarConfig, logger: AirbyteLogger) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/calendarListEntries.json');
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
    streamState?: CalendarListEntriesState
  ): AsyncGenerator<CalendarListEntry> {
    const googleCalendar = await Googlecalendar.instance(
      this.config,
      this.logger
    );
    const syncToken =
      syncMode === SyncMode.INCREMENTAL
        ? streamState?.lastSyncToken
        : undefined;

    yield* googleCalendar.getCalendarList(syncToken);
  }

  getUpdatedState(
    currentStreamState: CalendarListEntriesState,
    latestRecord: CalendarListEntry
  ): CalendarListEntriesState {
    return {
      lastSyncToken:
        latestRecord?.nextSyncToken || currentStreamState.lastSyncToken,
    };
  }
}
