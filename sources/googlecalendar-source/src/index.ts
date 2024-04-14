import {Command} from 'commander';
import {
  AirbyteSourceBase,
  AirbyteSourceLogger,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {
  DEFAULT_CALENDAR_ID,
  Googlecalendar,
  GoogleCalendarConfig,
} from './googlecalendar';
import {Calendars, Events} from './streams';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteSourceLogger();
  const source = new GooglecalendarSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** GoogleCalendar source implementation. */
export class GooglecalendarSource extends AirbyteSourceBase<GoogleCalendarConfig> {
  get type(): string {
    return 'googlecalendar';
  }

  async spec(): Promise<AirbyteSpec> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  async checkConnection(
    config: GoogleCalendarConfig
  ): Promise<[boolean, VError]> {
    const calendars = config.calendar_ids ?? [DEFAULT_CALENDAR_ID];

    for (const calendarId of calendars) {
      try {
        const googleCalendar = await Googlecalendar.instance(
          config,
          this.logger,
          calendarId
        );
        await googleCalendar.getCalendar();
      } catch (error: any) {
        const err = new VError(
          `Please verify your private_key and client_email are correct and have access to '${calendarId}' calendar. ` +
            `Error: ${error?.message}`
        );
        return [false, err];
      }
    }

    return [true, undefined];
  }
  streams(config: GoogleCalendarConfig): AirbyteStreamBase[] {
    return [
      new Calendars(config, this.logger),
      new Events(config, this.logger),
    ];
  }
}
