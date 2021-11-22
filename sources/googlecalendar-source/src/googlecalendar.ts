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
export interface CalendarListEntry
  extends calendar_v3.Schema$CalendarListEntry {
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

export interface EventsState {
  updated?: string;
  lastSyncToken?: string;
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

  getEvents({updated, lastSyncToken}: EventsState): AsyncGenerator<Event> {
    const func = (pageToken?: string, syncToken?: string): Promise<Event> => {
      const params: calendar_v3.Params$Resource$Events$List = {
        calendarId: this.calendarId,
        pageToken,
        maxResults: this.maxResults.events,
      };
      
      if (updated) {
        this.logger.info('Sync Events by updated column');
        params.updatedMin = updated;
        params.orderBy = 'updated'
      }
      if (syncToken) {
        this.logger.info('Sync Events by syncToken column');
        params.syncToken = syncToken;
      }

      return this.client.events.list(params) as any;
    };

    return this.paginate(func, lastSyncToken);
  }

  getCalendarList(lastSyncToken?: string): AsyncGenerator<CalendarListEntry> {
    const func = (
      pageToken?: string,
      syncToken?: string
    ): Promise<CalendarListEntry> =>
      this.client.calendarList.list({
        pageToken,
        syncToken,
        maxResults: this.maxResults.calendars,
      }) as any;

    return this.paginate(func, lastSyncToken);
  }
}

// Before running the sample:
// - Enable the API at:
//   https://console.developers.google.com/apis/api/calendar.googleapis.com
// - Login into gcloud by running:
//   `$ gcloud auth application-default login`
// - Install the npm module by running:
//   `$ npm install googleapis`

async function main(): Promise<void> {
  const logger = new AirbyteLogger();
  const calendar = await Googlecalendar.instance(
    {
      private_key:
        '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCXTwJGFTgvuNgc\nATtVdlswQ5kNoAizpLz3V9NBXyEKvF4S9pwFuOXU6TgtaNTa3Mzn+JjPFmdZ7UC6\nUC0nlzbxniKGQVCgk1wMmHgtIite77qSGCae/hnbHTJb9YdXKRT6aHUZTQ2brvxY\nT3kIGzusvdYsJJKqwHSXJ+qY+QlbGoIz+Aey13dM1pcc1fO7gf5mfXpjZETxrNJ6\nmydNLiTAx+ngApG4vbNOV+JSanuow4VTyql10CRZ0ceNHtvKPy02LdkJ4kvDz89A\njGrS8GRTQQHkLpPvhZUNW+WwUAHilR2+WVajgg2FUoCrhbh8hw6zaSu/5XvRi0nf\nEcCGUx8XAgMBAAECggEAFWT5OqpKxN9WGgpH4XsCxH2fvpV0+txoURunUK8AH7co\nIMujSWEuM5S7z2/rPlHKMg1XTgYqRu+NH3WxbM+s19fhpH9ybxdnBJY/0oyU+q+F\nqfKlmLBFPP473f+G9i67kKIEggyrHUBOM2PJW/loeVxo/to3rX0uVHvdvWjj3HBY\nxLqnjsehj8qsFqSey6DKa1xcFaBYavqpMVnhtDTNo+WUoUhfrfoXFEetMURtQBe0\nj8vyJShOZXkabPhNIlK4PBV3XUy95Ss8DD6HMOpY5sDcMLZPToQIs+k//KbV56rf\ngLWmwE+FBZIjEfK44Uo3kYrKSma1zRlOw37wPxHAQQKBgQDKv4sjVhBBQQstB+Ar\n0w7pEhFhZQa3YkZ4NY9c3tOpN3KI4HHErSjxfVZ26VfCImRN90TVTajMoBtbJytp\npHfFlbauWgxTDDI/8Q4nAqsnNu4fnUyInhpEMhEwEQV2m3XfNIFzH6HvQJLVuNPL\nn9JSe8QQjKISrvgK7pu0z6sHlQKBgQC/DMCJC/xRLBeN/vyz79PwO7QDkyDUfDwG\nZauRdsr/dVqYSBCp815loLaH98yPHS7VncePwvA2tZnXtrDKelrkrSBc7SmSQ7Pr\n7Ut8VUY4Sq/F3vDHCnUPzu9mQ9OlLVD+a8qRzHy9GxNDss+u3oksT75E08K0imZG\nUiLX+qvw+wKBgQC47DG8/h9/VRMbdGZ7slqULH2bxqh0lPdPZxKmkzqcycz2mThL\nOeDxOe+mL7hyginYjuLCZr3CPXoWDsji5zazCZWAuvMowCQI/BV7cUyoTMquHSuU\nJBgzATN6EtxXzP2aouo7Fav+a3hB5P2QaOpNf0NaENs2jU4BspZkOVF2bQKBgFEg\n4ynPUyhNJvt/imQGteNQFxNliQ1ybDLzPbYZ0f5FIWGFSL5CwJU7eAepLM6hP+Aq\njjH4P/WbjGbUB6MT7kEpW5Lai0q3QVIwhFuaAqWo4ZePIoQDZs59u5+bseZ0pe5E\na9MaGOZc9wNKjXLewTV174BexFHSa7f07SL2Kcm9AoGAXssIRlxewMotnJP/lt/v\n0RuLHtHkHSIKPV2z6QnuikUeJwTJMUgv9OZQ1IJKUCfq4qU3gqSdIIjbjs65eK7h\n+XbcmbNvA8ymAiyR41r6fttHbCHVBenZucOBRcfiyKhu39VSF6qa4oEhxrSQCiDp\n1saYaKV33Z5JFcVYytQce40=\n-----END PRIVATE KEY-----\n',
      client_email: 'faros-test@faros-test-332209.iam.gserviceaccount.com',
    },
    logger
  );

  await calendar.checkConnection();

  const iter = calendar.getEvents({});

  for await (const event of iter) {
    console.log({event: event.start});
  }

  // const calendar = google.calendar('v3');
  // const auth = new google.auth.GoogleAuth({
  //   // Scopes can be specified either as an array or as a single, space-delimited string.
  //   scopes: ['https://www.googleapis.com/auth/calendar'],
  //   credentials: {
  //     private_key:
  //       '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCXTwJGFTgvuNgc\nATtVdlswQ5kNoAizpLz3V9NBXyEKvF4S9pwFuOXU6TgtaNTa3Mzn+JjPFmdZ7UC6\nUC0nlzbxniKGQVCgk1wMmHgtIite77qSGCae/hnbHTJb9YdXKRT6aHUZTQ2brvxY\nT3kIGzusvdYsJJKqwHSXJ+qY+QlbGoIz+Aey13dM1pcc1fO7gf5mfXpjZETxrNJ6\nmydNLiTAx+ngApG4vbNOV+JSanuow4VTyql10CRZ0ceNHtvKPy02LdkJ4kvDz89A\njGrS8GRTQQHkLpPvhZUNW+WwUAHilR2+WVajgg2FUoCrhbh8hw6zaSu/5XvRi0nf\nEcCGUx8XAgMBAAECggEAFWT5OqpKxN9WGgpH4XsCxH2fvpV0+txoURunUK8AH7co\nIMujSWEuM5S7z2/rPlHKMg1XTgYqRu+NH3WxbM+s19fhpH9ybxdnBJY/0oyU+q+F\nqfKlmLBFPP473f+G9i67kKIEggyrHUBOM2PJW/loeVxo/to3rX0uVHvdvWjj3HBY\nxLqnjsehj8qsFqSey6DKa1xcFaBYavqpMVnhtDTNo+WUoUhfrfoXFEetMURtQBe0\nj8vyJShOZXkabPhNIlK4PBV3XUy95Ss8DD6HMOpY5sDcMLZPToQIs+k//KbV56rf\ngLWmwE+FBZIjEfK44Uo3kYrKSma1zRlOw37wPxHAQQKBgQDKv4sjVhBBQQstB+Ar\n0w7pEhFhZQa3YkZ4NY9c3tOpN3KI4HHErSjxfVZ26VfCImRN90TVTajMoBtbJytp\npHfFlbauWgxTDDI/8Q4nAqsnNu4fnUyInhpEMhEwEQV2m3XfNIFzH6HvQJLVuNPL\nn9JSe8QQjKISrvgK7pu0z6sHlQKBgQC/DMCJC/xRLBeN/vyz79PwO7QDkyDUfDwG\nZauRdsr/dVqYSBCp815loLaH98yPHS7VncePwvA2tZnXtrDKelrkrSBc7SmSQ7Pr\n7Ut8VUY4Sq/F3vDHCnUPzu9mQ9OlLVD+a8qRzHy9GxNDss+u3oksT75E08K0imZG\nUiLX+qvw+wKBgQC47DG8/h9/VRMbdGZ7slqULH2bxqh0lPdPZxKmkzqcycz2mThL\nOeDxOe+mL7hyginYjuLCZr3CPXoWDsji5zazCZWAuvMowCQI/BV7cUyoTMquHSuU\nJBgzATN6EtxXzP2aouo7Fav+a3hB5P2QaOpNf0NaENs2jU4BspZkOVF2bQKBgFEg\n4ynPUyhNJvt/imQGteNQFxNliQ1ybDLzPbYZ0f5FIWGFSL5CwJU7eAepLM6hP+Aq\njjH4P/WbjGbUB6MT7kEpW5Lai0q3QVIwhFuaAqWo4ZePIoQDZs59u5+bseZ0pe5E\na9MaGOZc9wNKjXLewTV174BexFHSa7f07SL2Kcm9AoGAXssIRlxewMotnJP/lt/v\n0RuLHtHkHSIKPV2z6QnuikUeJwTJMUgv9OZQ1IJKUCfq4qU3gqSdIIjbjs65eK7h\n+XbcmbNvA8ymAiyR41r6fttHbCHVBenZucOBRcfiyKhu39VSF6qa4oEhxrSQCiDp\n1saYaKV33Z5JFcVYytQce40=\n-----END PRIVATE KEY-----\n',
  //     client_email: 'faros-test@faros-test-332209.iam.gserviceaccount.com',
  //   },
  // });

  // // Acquire an auth client, and bind it to all future calls
  // const authClient = await auth.getClient();
  // google.options({auth: authClient});

  // const calendarId = DEFAULT_CALENDAR_ID;

  // const iter = await calendar.events.patch({
  //   calendarId,
  //   eventId: 'p5kpjbg4tkoe8himhnrd41vi94',
  //   requestBody: {
  //     status: 'cancelled',
  //   },
  // });

  // console.log({data: iter.data});

  // console.log({
  //   events: (
  //     await calendar.events.get({
  //       calendarId,
  //       eventId: 'p5kpjbg4tkoe8himhnrd41vi94',
  //     })
  //   ).data,
  // });
}

// main().catch((e) => {
//   console.error(e);
// });

// 2021-11-18T07:55:12.138Z
