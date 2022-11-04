import {AirbyteConfig, AirbyteLogger, wrapApiError} from 'faros-airbyte-cdk';
import {calendar_v3, google} from 'googleapis';
import {Memoize} from 'typescript-memoize';
import {VError} from 'verror';

const DEFAULT_CALENDAR_ID = 'primary';
const DEFAULT_EVENT_MAX_RESULTS = 2500;
const DEFAULT_CUTOFF_DAYS = 90;

/** SyncToken point to last variable. It makes the result of this list
 * request contain only entries that have changed since then */
export interface Event extends calendar_v3.Schema$Event {
  nextSyncToken?: string;
  calendarId?: string;
}
export type Calendar = calendar_v3.Schema$Calendar;

export interface GoogleCalendarConfig extends AirbyteConfig {
  readonly client_email: string;
  readonly private_key: string;
  readonly calendar_id?: string;
  readonly events_max_results?: number;
  readonly cutoff_days?: number;
}

type PaginationReqFunc = (pageToken?: string) => Promise<any>;
type ErrorWrapperReqFunc<T> = (...opts: any) => Promise<T>;

export class Googlecalendar {
  private static googleCalendar: Googlecalendar = null;

  constructor(
    private readonly client: calendar_v3.Calendar,
    private readonly calendarId: string,
    private readonly eventsMaxResults: number,
    private readonly cutoffDays: number,
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
        private_key: config.private_key.replace(/\\n/g, '\n'),
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

    const eventsMaxResults =
      config.events_max_results ?? DEFAULT_EVENT_MAX_RESULTS;

    const cutoffDays = config.cutoff_days ?? DEFAULT_CUTOFF_DAYS;

    Googlecalendar.googleCalendar = new Googlecalendar(
      calendar,
      calendarId,
      eventsMaxResults,
      cutoffDays,
      logger
    );
    return Googlecalendar.googleCalendar;
  }

  private async invokeCallWithErrorWrapper<T>(
    func: ErrorWrapperReqFunc<T>,
    message = '',
    pageToken?: string,
    lastSyncToken?: string
  ): Promise<T> {
    let res: T;
    try {
      res = await func(pageToken, lastSyncToken);
    } catch (err: any) {
      // A 410 status code, "Gone", indicates that the sync token is invalid.
      // Read more - https://developers.google.com/calendar/api/guides/sync
      if (err?.status === 410) {
        this.logger.debug('Invalid sync token, starting a full sync.');
        this.invokeCallWithErrorWrapper(func, message, pageToken);
      }
      this.wrapAndThrow(err, message);
    }
    return res;
  }

  private wrapAndThrow(err: any, message = ''): void {
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

  private async *paginate(
    func: PaginationReqFunc,
    lastSyncToken?: string,
    calendarId?: string
  ): AsyncGenerator {
    let nextPageToken: string | undefined;

    do {
      const response = await this.invokeCallWithErrorWrapper(
        func,
        '',
        nextPageToken,
        lastSyncToken
      );

      if (response?.status >= 300) {
        throw new VError(`${response?.status}: ${response?.statusText}`);
      }
      const nextSyncToken = response?.data?.nextSyncToken;
      for (const item of response?.data.items ?? []) {
        yield {...item, nextSyncToken, calendarId};
      }

      nextPageToken = response?.data?.nextPageToken;
    } while (nextPageToken);
  }

  async *getEvents(lastSyncToken?: string): AsyncGenerator<Event> {
    const calendar = await this.getCalendar();

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - this.cutoffDays);

    const func = (pageToken?: string, syncToken?: string): Promise<Event> => {
      const params: calendar_v3.Params$Resource$Events$List = {
        calendarId: calendar.id,
        pageToken,
        maxResults: this.eventsMaxResults,
        timeMin: startDate.toISOString(),
      };

      if (syncToken) {
        this.logger.debug(
          `Incrementally sync events from syncToken: ${syncToken}`
        );
        params.syncToken = syncToken;
      }

      return this.client.events.list(params) as any;
    };

    for await (const res of this.paginate(func, lastSyncToken, calendar.id)) {
      yield res;
    }
  }

  @Memoize((calendarId: string) => calendarId)
  async getCalendar(calendarId = this.calendarId): Promise<Calendar> {
    try {
      const response = await this.client.calendars.get({calendarId});
      return response.data;
    } catch (err: any) {
      this.wrapAndThrow(err);
    }
  }
}
