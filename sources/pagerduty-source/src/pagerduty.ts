import {api} from '@pagerduty/pdjs';
import {PartialCall} from '@pagerduty/pdjs/build/src/api';
import {AirbyteLogger, wrapApiError} from 'faros-airbyte-cdk';
import {DateTime} from 'luxon';
import {VError} from 'verror';

export const DEFAULT_CUTOFF_DAYS = 90;
const DEFAULT_OVERVIEW = true;
const DEFAULT_PAGE_SIZE = 25; // 25 is API default
export const DEFAULT_FETCH_TEAMS = true;

enum IncidentSeverityCategory {
  Sev1 = 'Sev1',
  Sev2 = 'Sev2',
  Sev3 = 'Sev3',
  Sev4 = 'Sev4',
  Sev5 = 'Sev5',
  Custom = 'Custom',
}
type IncidentUrgency = 'high' | 'low'; // PagerDuty only has these two priorities
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
  readonly exclude_services?: ReadonlyArray<string>;
  readonly service_details?: ReadonlyArray<string>;
  readonly max_retries?: number;
  readonly fetch_teams?: boolean;
}

export interface PagerdutyResponse<Type> {
  url: string;
  status: number;
  statusText: string;
  data: any;
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
  readonly time_zone: string; // tzinfo
  readonly role: string;
  readonly description: string;
  readonly job_title: string;
}

export interface Team extends PagerdutyObject {
  readonly name: string;
  readonly description: string;
}

export interface LogEntry extends PagerdutyObject {
  readonly created_at: string; // date-time
  readonly incident: PagerdutyObject;
  readonly service: PagerdutyObject;
  readonly event_details?: Record<string, any>; // e.g. trigger events have "description" detail
  readonly agent: PagerdutyObject;
}

export interface Incident extends PagerdutyObject {
  readonly description: string;
  readonly status: IncidentState;
  readonly acknowledgements: Acknowledgement[];
  readonly incident_key: string; // UID
  readonly urgency: IncidentUrgency;
  readonly title: string;
  readonly created_at: string; // date-time
  readonly updated_at: string;
  readonly service: PagerdutyObject;
  readonly assignments: Assignment[];
  readonly priority?: Priority;
  readonly last_status_change_at: string;
  readonly resolved_at: string;
}

export interface Priority extends PagerdutyObject {
  readonly description: string;
  readonly name: string;
}

export interface Service extends PagerdutyObject {
  readonly name: string;
  readonly teams: PagerdutyObject[];
}

const DEFAULT_MAX_RETRIES = 5;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export class Pagerduty {
  private static pagerduty: Pagerduty = null;

  constructor(
    private readonly client: PartialCall,
    private readonly logger: AirbyteLogger,
    private readonly pageSize = DEFAULT_PAGE_SIZE,
    private readonly maxRetries = DEFAULT_MAX_RETRIES
  ) {}

  static instance(config: PagerdutyConfig, logger: AirbyteLogger): Pagerduty {
    if (Pagerduty.pagerduty) return Pagerduty.pagerduty;

    if (!config.token) {
      throw new VError('token must be not an empty string');
    }
    const client = api({token: config.token});
    Pagerduty.pagerduty = new Pagerduty(
      client,
      logger,
      config.page_size,
      config.max_retries
    );
    return Pagerduty.pagerduty;
  }

  private async errorWrapper<T>(
    func: () => Promise<T>,
    retries = 0
  ): Promise<T> {
    let res: T;
    try {
      res = await func();
    } catch (err: any) {
      const url = err.url ?? 'Unknown url';
      if (err.error_code || err.error_info) {
        throw new VError(
          '%s',
          `Received status code ${err.error_code}: ${err.error_info} from ${url}`
        );
      }
      let errorMessage;
      try {
        errorMessage = err.message ?? err.statusText ?? wrapApiError(err);
      } catch (wrapError: any) {
        errorMessage = wrapError.message;
      }
      errorMessage = `Error from ${url}. Message: ${errorMessage}`;

      if (++retries > this.maxRetries) {
        throw new VError('%s', errorMessage);
      } else {
        const secs = Math.pow(2, retries);
        this.logger.error(`${errorMessage}. Retrying in ${secs} seconds...`);
        await sleep(secs * 1000);
        return await this.errorWrapper(func, retries);
      }
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
      // Deal with PagerDuty 10000 records response limit
      if (
        response?.status == 400 &&
        response?.data?.error?.errors?.[0]?.includes('Offset')
      ) {
        this.logger.warn(
          `Reached PagerDuty API response size limit of 10000 records.`
        );
        return undefined;
      }
      if (response?.status >= 300) {
        throw new VError(
          '%s',
          `Error from ${response?.url}. Status code: ${response?.status}: ${
            response?.statusText
          }. Data: ${JSON.stringify(response?.data)}`
        );
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

  async *getUsers(): AsyncGenerator<User> {
    const resource = `/users`;
    this.logger.debug(`Fetching Users at ${resource}`);
    yield* this.paginate<User>(() => this.client.get(resource));
  }

  async *getTeams(): AsyncGenerator<Team> {
    const resource = `/teams`;
    this.logger.debug(`Fetching Team at ${resource}`);
    yield* this.paginate<Team>(() => this.client.get(resource));
  }

  async *getIncidents(
    since: DateTime,
    until: DateTime,
    exclude_services: ReadonlyArray<string> = []
  ): AsyncGenerator<Incident> {
    const params = new URLSearchParams({time_zone: 'UTC'});

    const services: (Service | undefined)[] = [];
    if (exclude_services?.length > 0) {
      const servicesIter = this.getServices([]);
      for await (const service of servicesIter) {
        if (
          exclude_services.includes(service.name) ||
          exclude_services.includes(service.summary)
        ) {
          this.logger.debug(
            `Excluding Incidents from service id: ${service.id}, name: ${service.name}, summary: ${service.summary}`
          );
        } else {
          services.push(service);
        }
      }
    } else {
      services.push(undefined); // fetch incidents from all services
    }

    // query per service to minimize chance of hitting 10000 records response limit
    for (const service of services) {
      if (service) {
        this.logger.debug(
          `Fetching Incidents for service id: ${service.id}, name: ${service.name}, summary: ${service.summary}`
        );
        params.set('service_ids[]', service.id);
      }

      const diff = until.diff(since, 'days');
      this.logger.debug(
        `Fetching Incidents in range ${since} - ${until}. Total of ${diff.days} days.`
      );

      for (let d = 0; d < diff.days; d++) {
        params.set('since', until.minus({days: d + 1}).toISO());
        params.set('until', until.minus({days: d}).toISO());

        const resource = `/incidents?${params}`;
        this.logger.debug(`Fetching Incidents at ${resource}`);
        yield* this.paginate<Incident>(() => this.client.get(resource));
      }
    }
  }

  async *getIncidentLogEntries(
    since: DateTime,
    until: DateTime,
    isOverview = DEFAULT_OVERVIEW
  ): AsyncGenerator<LogEntry> {
    const params = new URLSearchParams({
      is_overview: `${isOverview}`,
      time_zone: 'UTC',
    });

    const diff = until.diff(since, 'days');
    this.logger.debug(
      `Fetching Log Entries in range ${since} - ${until}. Total of ${diff.days} days.`
    );

    for (let d = 0; d < diff.days; d++) {
      params.set('since', until.minus({days: d + 1}).toISO());
      params.set('until', until.minus({days: d}).toISO());

      const resource = `/log_entries?${params}`;
      this.logger.debug(`Fetching Log Entries at ${resource}`);
      const sinceJSDate = since.toJSDate();
      const iter = this.paginate<LogEntry>(() => this.client.get(resource));
      for await (const logEntry of iter) {
        if (new Date(logEntry.created_at) > sinceJSDate) {
          yield logEntry;
        }
      }
    }
  }

  async *getPrioritiesResource(): AsyncGenerator<Priority> {
    let res;
    try {
      res = await this.errorWrapper(() => this.client.get(`/priorities`));
    } catch (err) {
      res = err;
    }

    if (res.response?.ok) {
      for (const item of res.resource) {
        yield item;
      }
    }
  }

  async *getServices(
    details: ReadonlyArray<string> = []
  ): AsyncGenerator<Service> {
    const params = new URLSearchParams({});
    for (const detail of details) {
      params.append('include[]', detail);
    }
    const servicesResource = `/services?${params}`;
    this.logger.debug(`Fetching Services at ${servicesResource}`);
    const func = (): any => {
      return this.client.get(servicesResource);
    };
    yield* this.paginate<Service>(func);
  }
}
