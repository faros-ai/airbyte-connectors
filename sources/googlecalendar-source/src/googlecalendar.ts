import {AirbyteConfig, AirbyteLogger} from 'faros-airbyte-cdk';
import {wrapApiError} from 'faros-feeds-sdk';
import {calendar_v3, google} from 'googleapis';
import {VError} from 'verror';

const DEFAULT_CALENDAR_ID = 'primary';
const DEFAULT_EVENT_MAX_RESULTS = 2500;
const DEFAULT_CALENDAR_LIST_MAX_RESULTS = 250;

/** SyncToken point to last variable. It makes the result of this list
 * request contain only entries that have changed since then */
export interface Event extends calendar_v3.Schema$Event {
  nextSyncToken?: string;
}
export interface Calendar extends calendar_v3.Schema$CalendarListEntry {
  nextSyncToken?: string;
}

export interface GoogleCalendarConfig extends AirbyteConfig {
  readonly client_email: string;
  readonly private_key: string;
  readonly calendar_id?: string;
  readonly events_max_results?: number;
  readonly calendars_max_results?: number;
}

interface MaxResults {
  readonly events: number;
  readonly calendars: number;
}

type PaginationReqFunc = (pageToken?: string) => Promise<any>;
type ErrorWrapperReqFunc<T> = (...opts: any) => Promise<T>;

export class Googlecalendar {
  private static googleCalendar: Googlecalendar = null;

  constructor(
    private readonly client: calendar_v3.Calendar,
    private readonly calendarId: string,
    private readonly maxResults: MaxResults,
    private readonly logger: AirbyteLogger
  ) {}

  static async instance(
    config: GoogleCalendarConfig,
    logger: AirbyteLogger
  ): Promise<Googlecalendar> {
    if (Googlecalendar.googleCalendar) return Googlecalendar.googleCalendar;
    
    if (typeof config.private_key !== 'string') {
      throw new VError('private_key: must be a string');
    }
    if (typeof config.client_email !== 'string') {
      throw new VError('client_email: must be a string');
    }

    const calendar = google.calendar('v3');
    
    const auth = new google.auth.GoogleAuth({
      // Scopes can be specified either as an array or as a single, space-delimited string.
      scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
      credentials: {
        private_key: config.private_key,
        client_email: config.client_email,
      },
    });
    
    // Acquire an auth client, and bind it to all future calls
    const authClient = await auth.getClient();
    google.options({auth: authClient});

    const calendarId =
      typeof config?.calendar_id === 'string'
        ? config.calendar_id
        : DEFAULT_CALENDAR_ID;
    const maxResults = {
      events: config.events_max_results ?? DEFAULT_EVENT_MAX_RESULTS,
      calendars:
        config.calendars_max_results ?? DEFAULT_CALENDAR_LIST_MAX_RESULTS,
    };

    Googlecalendar.googleCalendar = new Googlecalendar(
      calendar,
      calendarId,
      maxResults,
      logger
    );
    return Googlecalendar.googleCalendar;
  }

  async checkConnection(): Promise<void> {
    await this.errorWrapper<calendar_v3.Schema$CalendarList>(
      () => this.client.calendarList.list() as any,
      'Please verify your private_key and client_email are correct. Error: '
    );
  }

  private async errorWrapper<T>(
    func: ErrorWrapperReqFunc<T>,
    message = '',
    pageToken?: string,
    lastSyncToken?: string
  ): Promise<T> {
    let res: T;
    try {
      res = await func(pageToken, lastSyncToken);
    } catch (err: any) {
      if (err?.status === 410) {
        this.errorWrapper(func, message, pageToken);
      }

      if (err.error_code || err.error_info) {
        throw new VError(`${err.error_code}: ${err.error_info}`);
      }
      let errorMessage = message;
      try {
        errorMessage += err.message ?? err.statusText ?? wrapApiError(err);
      } catch (wrapError: any) {
        errorMessage += wrapError.message;
      }
      throw new VError(errorMessage);
    }
    return res;
  }

  private async *paginate(
    func: PaginationReqFunc,
    lastSyncToken?: string
  ): AsyncGenerator {
    let nextPageToken: string | undefined;

    do {
      const response = await this.errorWrapper(
        func,
        undefined,
        nextPageToken,
        lastSyncToken
      );

      if (response?.status >= 300) {
        throw new VError(`${response?.status}: ${response?.statusText}`);
      }
      const nextSyncToken = response?.data?.nextSyncToken;
      for (const item of response?.data.items ?? []) {
        yield {...item, nextSyncToken};
      }

      nextPageToken = response?.data?.nextPageToken;
    } while (nextPageToken);
  }

  getEvents(lastSyncToken?: string): AsyncGenerator<Event> {
    const func = (pageToken?: string, syncToken?: string): Promise<Event> => {
      const params: calendar_v3.Params$Resource$Events$List = {
        calendarId: this.calendarId,
        pageToken,
        maxResults: this.maxResults.events,
      };

      if (syncToken) {
        this.logger.debug('Sync Events by syncToken column');
        params.syncToken = syncToken;
      }

      return this.client.events.list(params) as any;
    };

    return this.paginate(func, lastSyncToken);
  }

  getCalendars(lastSyncToken?: string): AsyncGenerator<Calendar> {
    const func = (pageToken?: string, syncToken?: string): Promise<Calendar> =>
      this.client.calendarList.list({
        pageToken,
        syncToken,
        maxResults: this.maxResults.calendars,
      }) as any;

    return this.paginate(func, lastSyncToken);
  }
}
