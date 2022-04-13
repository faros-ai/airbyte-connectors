import {api} from '@pagerduty/pdjs';
import {AirbyteLogger, wrapApiError} from 'faros-airbyte-cdk';
import {VError} from 'verror';

export const DEFAULT_CUTOFF_DAYS = 90;
const DEFAUTL_OVERVIEW = true;
const DEFAULT_PAGE_SIZE = 25; // 25 is API default

enum IncidentSeverityCategory {
  Sev1 = 'Sev1',
  Sev2 = 'Sev2',
  Sev3 = 'Sev3',
  Sev4 = 'Sev4',
  Sev5 = 'Sev5',
  Custom = 'Custom',
}
type IncidentUrgency = 'high' | 'low'; //Pagerduty only has these two priorities
type IncidentState = 'triggered' | 'acknowledged' | 'resolved';

interface Acknowledgement {
  at: string; //date-time
  acknowledger: PagerdutyObject;
}

interface Assignment {
  at: string; //date-time
  assignee: PagerdutyObject;
}

export interface PagerdutyConfig {
  readonly token: string;
  readonly cutoff_days?: number;
  readonly page_size?: number;
  readonly default_severity?: IncidentSeverityCategory;
  readonly incident_log_entries_overview?: boolean;
}

interface PagerdutyResponse<Type> {
  status: number;
  statusText: string;
  resource: Type[];
  next?: () => Promise<PagerdutyResponse<Type>>;
}

interface PagerdutyObject {
  readonly id: string;
  readonly type: string; // object type of the form <name>_reference
  readonly summary: string; // human readable summary
  readonly self: string; // API discrete resource url
  readonly html_url: string; // Pagerduty web url
}

export interface User extends PagerdutyObject {
  readonly email: string;
  readonly name: string;
}

export interface LogEntry extends PagerdutyObject {
  readonly created_at: string; // date-time
  readonly incident: PagerdutyObject;
  readonly service: PagerdutyObject;
  readonly event_details?: Record<string, any>; // e.g. trigger events have "description" detail
}

export interface Incident extends PagerdutyObject {
  readonly description: string;
  readonly status: IncidentState;
  readonly acknowledgements: Acknowledgement[];
  readonly incident_key: string; // UID
  readonly urgency: IncidentUrgency;
  readonly title: string;
  readonly created_at: string; // date-time
  readonly service: PagerdutyObject;
  readonly assignments: Assignment[];
  readonly priority?: Priority;
  readonly last_status_change_at: string;
}

export interface Priority extends PagerdutyObject {
  readonly description: string;
  readonly name: string;
}

export class Pagerduty {
  private static pagerduty: Pagerduty = null;

  constructor(
    private readonly client: any,
    private readonly logger: AirbyteLogger
  ) {}

  static instance(config: PagerdutyConfig, logger: AirbyteLogger): Pagerduty {
    if (Pagerduty.pagerduty) return Pagerduty.pagerduty;

    if (!config.token) {
      throw new VError('token must be not an empty string');
    }

    const client = api({token: config.token});

    Pagerduty.pagerduty = new Pagerduty(client, logger);
    logger.debug('Created Pagerduty instance');

    return Pagerduty.pagerduty;
  }

  private async errorWrapper<T>(func: () => Promise<T>): Promise<T> {
    let res: T;
    try {
      res = await func();
    } catch (err: any) {
      if (err.error_code || err.error_info) {
        throw new VError(`${err.error_code}: ${err.error_info}`);
      }
      let errorMessage;
      try {
        errorMessage = err.message ?? err.statusText ?? wrapApiError(err);
      } catch (wrapError: any) {
        errorMessage = wrapError.message;
      }
      throw new VError(errorMessage);
    }
    return res;
  }

  private async *paginate<T>(
    func: () => Promise<PagerdutyResponse<T>>,
    broker: (item: T) => boolean = (): boolean => false
  ): AsyncGenerator<T> {
    let response = await this.errorWrapper<PagerdutyResponse<T>>(func);
    let fetchNextFunc;

    do {
      if (response?.status >= 300) {
        throw new VError(`${response?.status}: ${response?.statusText}`);
      }
      if (response?.next) fetchNextFunc = response?.next;

      for (const item of response?.resource ?? []) {
        const stopReading = broker(item);
        if (stopReading) {
          return undefined;
        }
        yield item;
      }
      response = response.next
        ? await this.errorWrapper<PagerdutyResponse<T>>(fetchNextFunc)
        : undefined;
    } while (response);
  }

  async checkConnection(): Promise<void> {
    try {
      await this.client.get('/users');
    } catch (error: any) {
      let errorMessage;
      try {
        errorMessage = error.message ?? error.statusText ?? wrapApiError(error);
      } catch (wrapError: any) {
        errorMessage = wrapError.message;
      }
      throw new VError(
        `Please verify your token are correct. Error: ${errorMessage}`
      );
    }
  }

  async *getUsers(
    state?: User | null,
    cursorField?: string[]
  ): AsyncGenerator<User> {
    const func = (): Promise<PagerdutyResponse<User>> => {
      return this.client.get(`/users`);
    };
    yield* this.paginate<User>(func, (item): boolean => {
      if (state) {
        const fieldsExistingList = cursorField.map((f) => item[f] === state[f]);
        return fieldsExistingList.findIndex((b) => !b) <= -1;
      }
      return false;
    });
  }

  async *getIncidents(
    since?: string,
    limit = DEFAULT_PAGE_SIZE
  ): AsyncGenerator<Incident> {
    let until: Date;
    let timeRange = '&date_range=all';
    if (since) {
      until = new Date(since);
      until.setMonth(new Date(since).getMonth() + 5); //default time window is 1 month, setting to max
      until.setHours(0, 0, 0); //rounding down to whole day

      timeRange = `&since=${since}&until=${until.toISOString()}`;
    }
    const limitParam = `&limit=${limit.toFixed()}`;
    const incidentsResource = `/incidents?time_zone=UTC${timeRange}${limitParam}`;
    this.logger.debug(`Fetching Incidents at ${incidentsResource}`);

    const func = (): any => {
      return this.client.get(incidentsResource);
    };

    yield* this.paginate<Incident>(func);
  }

  async *getIncidentLogEntries(
    since?: string,
    until?: Date,
    limit: number = DEFAULT_PAGE_SIZE,
    isOverview = DEFAUTL_OVERVIEW
  ): AsyncGenerator<LogEntry> {
    const sinceParam = since ? `&since=${since}` : '';
    const untilParam = until ? `&until=${until.toISOString()}` : '';
    const limitParam = `&limit=${limit.toFixed()}`;
    const isOverviewParam = `&is_overview=${isOverview}`;

    const logsResource = `/log_entries?time_zone=UTC${sinceParam}${untilParam}${limitParam}${isOverviewParam}`;
    this.logger.debug(`Fetching Log Entries at ${logsResource}`);
    const func = (): any => {
      return this.client.get(logsResource);
    };

    yield* this.paginate<LogEntry>(func);
  }

  async *getPrioritiesResource(): AsyncGenerator<Priority> {
    let res;
    try {
      res = await this.client.get(`/priorities`);
    } catch (err) {
      res = err;
    }

    if (res.response?.ok) {
      for (const item of res.resource) {
        yield item;
      }
    }
  }
}
