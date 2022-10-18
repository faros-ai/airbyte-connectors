import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {
  Calendar,
  Googlecalendar,
  GoogleCalendarConfig,
} from '../googlecalendar';

interface CalendarsState {
  lastSyncToken?: string;
}

export class Calendars extends AirbyteStreamBase {
  constructor(readonly config: GoogleCalendarConfig, logger: AirbyteLogger) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/calendars.json');
  }
  get primaryKey(): StreamKey {
    return 'id';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any, string>,
    streamState?: CalendarsState
  ): AsyncGenerator<Calendar> {
    const googleCalendar = await Googlecalendar.instance(
      this.config,
      this.logger
    );
    yield await googleCalendar.getCalendar();
  }
}
