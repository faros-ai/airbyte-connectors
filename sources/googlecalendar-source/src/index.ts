import {Command} from 'commander';
import {
  AirbyteLogger,
  AirbyteSourceBase,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {Googlecalendar, GoogleCalendarConfig} from './googlecalendar';
import {Calendars, Events} from './streams';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new GooglecalendarSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** GoogleCalendar source implementation. */
export class GooglecalendarSource extends AirbyteSourceBase<GoogleCalendarConfig> {
  async spec(): Promise<AirbyteSpec> {
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  async checkConnection(
    config: GoogleCalendarConfig
  ): Promise<[boolean, VError]> {
    try {
      const googleCalendar = await Googlecalendar.instance(config, this.logger);
      await googleCalendar.checkConnection();
    } catch (error: any) {
      return [false, error];
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
