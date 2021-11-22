import {Command} from 'commander';
import {
  AirbyteConfig,
  AirbyteLogger,
  AirbyteSourceBase,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {Googlecalendar, GoogleCalendarConfig} from './googlecalendar';
import {CalendarListEntries, Events} from './streams';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new GooglecalendarSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** GoogleCalendar source implementation. */
export class GooglecalendarSource extends AirbyteSourceBase {
  async spec(): Promise<AirbyteSpec> {
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  async checkConnection(config: AirbyteConfig): Promise<[boolean, VError]> {
    try {
      const googleCalendar = await Googlecalendar.instance(
        config as GoogleCalendarConfig,
        this.logger
      );
      await googleCalendar.checkConnection();
    } catch (error: any) {
      return [false, error];
    }
    return [true, undefined];
  }
  streams(config: AirbyteConfig): AirbyteStreamBase[] {
    return [
      new CalendarListEntries(config as any, this.logger),
      new Events(config as any, this.logger),
    ];
  }
}
