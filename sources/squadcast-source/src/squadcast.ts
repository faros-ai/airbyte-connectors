import axios, {AxiosInstance, AxiosResponse} from 'axios';
import {AirbyteLogger} from 'faros-airbyte-cdk';
import {wrapApiError} from 'faros-feeds-sdk';
import {Memoize} from 'typescript-memoize';
import {VError} from 'verror';

import {
  AuthorizationResponse,
  Event,
  EventListResponse,
  Incident,
  IncidentsResponse,
  Meta,
  Service,
  ServiceResponse,
  User,
  UserResponse,
} from './models';

const API_URL = 'https://api.squadcast.com/v3/';
const AUTH_URL = 'https://auth.squadcast.com/';
const AUTH_HEADER_NAME = 'X-Refresh-Token';
const DEFAULT_INCIDENTS_START_DATE = '1970-01-01T00:00:00.000Z';
const DEFAULT_INCIDENTS_END_DATE = new Date().toISOString();

export interface SquadcastConfig {
  readonly token: string;
  readonly event_deduped?: boolean;
  readonly event_incident_id?: string;
}

interface PaginateResponse<T> {
  data: T[];
  meta: Meta;
}

export class Squadcast {
  private static squadcast: Squadcast = null;

  constructor(
    private readonly httpClient: AxiosInstance,
    private readonly eventIncidentId?: string,
    private readonly eventDeduped?: boolean
  ) {}

  static async instance(
    config: SquadcastConfig,
    logger: AirbyteLogger
  ): Promise<Squadcast> {
    if (Squadcast.squadcast) return Squadcast.squadcast;

    if (!config.token) {
      throw new VError('token must be a not empty string');
    }

    const accessToken = await this.getAccessToken(config.token);
    const httpClient = axios.create({
      baseURL: API_URL,
      timeout: 5000, // default is `0` (no timeout)
      maxContentLength: 20000, //default is 2000 bytes
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    Squadcast.squadcast = new Squadcast(
      httpClient,
      config.event_incident_id,
      config.event_deduped
    );
    logger.debug('Created SquadCast instance');

    return Squadcast.squadcast;
  }

  async checkConnection(): Promise<void> {
    try {
      const tenSecondsAgo = new Date(new Date().getTime() - 20000);
      await this.getIncidents(tenSecondsAgo.toISOString());
    } catch (err: any) {
      let errorMessage = 'Please verify your token are correct. Error: ';
      if (err.error_code || err.error_info) {
        errorMessage += `${err.error_code}: ${err.error_info}`;
        throw new VError(errorMessage);
      }
      try {
        errorMessage += err.message ?? err.statusText ?? wrapApiError(err);
      } catch (wrapError: any) {
        errorMessage += wrapError.message;
      }
      throw new VError(errorMessage);
    }
  }

  private static async getAccessToken(token: string): Promise<string> {
    const res = await axios.get<AuthorizationResponse>('oauth/access-token', {
      baseURL: AUTH_URL,
      headers: {[AUTH_HEADER_NAME]: token},
    });
    return res.data.data.access_token;
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
    func: (next?: string) => Promise<PaginateResponse<T>>
  ): AsyncGenerator<T> {
    let fetchNextFunc: string = undefined;

    do {
      const response = await this.errorWrapper<PaginateResponse<T>>(() =>
        func(fetchNextFunc)
      );

      if (response?.meta?.next) fetchNextFunc = response.meta.next;

      for (const item of response?.data ?? []) {
        yield item;
      }
    } while (fetchNextFunc);
  }

  @Memoize(
    (lastUpdatedAt?: string) =>
      new Date(lastUpdatedAt ?? DEFAULT_INCIDENTS_START_DATE)
  )
  async getIncidents(lastUpdatedAt?: string): Promise<ReadonlyArray<Incident>> {
    const incidents: Incident[] = [];
    const startTime =
      new Date(lastUpdatedAt ?? 0) > new Date(DEFAULT_INCIDENTS_START_DATE)
        ? lastUpdatedAt
        : DEFAULT_INCIDENTS_START_DATE;
    const endTime =
      new Date(startTime) > new Date(DEFAULT_INCIDENTS_END_DATE)
        ? startTime
        : DEFAULT_INCIDENTS_END_DATE;
    const res = await this.httpClient.get<IncidentsResponse>(
      'incidents/export',
      {
        params: {
          type: 'json',
          start_time: startTime,
          end_time: endTime,
        },
      }
    );
    for (const item of res.data.incidents) {
      incidents.push(item);
    }
    return incidents;
  }

  async *getEvents(): AsyncGenerator<Event> {
    for (const incident of await this.getIncidents()) {
      if (this.eventIncidentId && incident.id === this.eventIncidentId) {
        yield* this.fetchIncidentsEvents(incident);
        break;
      } else if (!this.eventIncidentId) {
        yield* this.fetchIncidentsEvents(incident);
      }
    }
  }

  async *fetchIncidentsEvents(incident: Incident): AsyncGenerator<Event> {
    const eventUrl = `incidents/${incident.id}/events`;
    const func = async (next?: string): Promise<PaginateResponse<Event>> => {
      let res: AxiosResponse<EventListResponse>;

      if (next) {
        /** Get next url's params */
        const nextUrlParams = next.slice(next.indexOf('?'));
        res = await this.httpClient.get<EventListResponse>(
          `${eventUrl}${nextUrlParams}`
        );
      }
      let params = undefined;
      if (typeof this.eventDeduped === 'boolean') {
        params = {deduped: this.eventDeduped};
      }
      res = await this.httpClient.get<EventListResponse>(eventUrl, {params});

      return {
        data: res.data.data.events.map((e) => {
          if (!e.payload?.status) {
            e.payload.status = incident.status;
          }

          return e;
        }),
        meta: res.data.meta,
      };
    };
    yield* this.paginate(func);
  }

  async *getServices(): AsyncGenerator<Service> {
    const res = await this.httpClient.get<ServiceResponse>('services');
    for (const item of res.data.data) {
      yield item;
    }
  }

  async *getUsers(): AsyncGenerator<User> {
    const res = await this.httpClient.get<UserResponse>('users');
    for (const item of res.data.data) {
      yield item;
    }
  }
}
