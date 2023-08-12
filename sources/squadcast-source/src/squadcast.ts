import axios, {AxiosInstance, AxiosResponse} from 'axios';
import {AirbyteLogger, wrapApiError} from 'faros-airbyte-cdk';
import {isEmpty} from 'lodash';
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
export const AUTH_URL = 'https://auth.squadcast.com/';
const AUTH_HEADER_NAME = 'X-Refresh-Token';
const DEFAULT_INCIDENTS_START_DATE = '1970-01-01T00:00:00.000Z';
const DEFAULT_INCIDENTS_END_DATE = new Date().toISOString();
const DEFAULT_CUTOFF_DAYS = 90;

export interface SquadcastConfig {
  readonly token: string;
  readonly incident_owner_id?: string;
  readonly services?: ReadonlyArray<string>;
  readonly event_owner_id?: string;
  readonly event_deduped?: boolean;
  readonly event_incident_id?: string;
  readonly cutoff_days: number;
}

interface PaginateResponse<T> {
  data: T[];
  meta: Meta;
}

export class Squadcast {
  private static squadcast: Squadcast = null;

  constructor(
    private readonly httpClient: AxiosInstance,
    private readonly startDate: Date,
    private readonly services: ReadonlyArray<string>,
    private readonly incident_owner_id?: string,
    private readonly event_owner_id?: string,
    private readonly eventIncidentId?: string,
    private readonly eventDeduped?: boolean
  ) {}

  static async instance(
    config: SquadcastConfig,
    logger: AirbyteLogger
  ): Promise<Squadcast> {
    if (Squadcast.squadcast) return Squadcast.squadcast;

    if (!config.token) {
      throw new VError('token must not be an empty string');
    }

    const accessToken = await this.getAccessToken(config.token);
    const httpClient = axios.create({
      baseURL: API_URL,
      timeout: 5000, // default is `0` (no timeout)
      maxContentLength: Infinity,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const startDate = new Date();
    startDate.setDate(
      startDate.getDate() - (config.cutoff_days || DEFAULT_CUTOFF_DAYS)
    );

    const services =
      !config.services || isEmpty(config.services) || config.services[0] === '*'
        ? []
        : config.services;

    if (services.length > 0) {
      logger.info(
        'Syncing the following SquadCast services: %s',
        services.join(',')
      );
    }

    Squadcast.squadcast = new Squadcast(
      httpClient,
      startDate,
      services,
      config.incident_owner_id,
      config.event_owner_id,
      config.event_incident_id,
      config.event_deduped
    );
    return Squadcast.squadcast;
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

  @Memoize((defaultValue: string) => defaultValue)
  private async listOwnerID(defaultValue): Promise<string[]> {
    if (defaultValue) {
      return [defaultValue];
    } else {
      const ids: string[] = [];
      const iterTeams = this.getTeams();

      for await (const {id: teamID} of iterTeams) {
        ids.push(teamID);
      }

      if (!ids.length) {
        const iterUsers = this.getUsers();
        for await (const {id: userID} of iterUsers) {
          ids.push(userID);
        }
      }

      return ids;
    }
  }

  @Memoize((ownerID: string, lastUpdatedAt?: string) => ownerID + lastUpdatedAt)
  private async fetchIncidentsWithOwnerID(
    ownerID: string,
    lastUpdatedAt?: string
  ): Promise<ReadonlyArray<Incident>> {
    const incidents: Incident[] = [];
    const dates = [];
    dates.push(new Date(lastUpdatedAt ?? 0));
    dates.push(new Date(DEFAULT_INCIDENTS_START_DATE));
    dates.push(this.startDate);
    const startTime = new Date(Math.max.apply(null, dates));
    const endTime =
      startTime > new Date(DEFAULT_INCIDENTS_END_DATE)
        ? startTime.toISOString()
        : DEFAULT_INCIDENTS_END_DATE;

    const params = new URLSearchParams();
    params.append('type', 'json');
    params.append('start_time', startTime.toISOString());
    params.append('end_time', endTime);
    params.append('owner_id', ownerID);

    if (this.services.length > 0) {
      for (const service of await this.getServices()) {
        params.append('service', service.id);
      }
    }

    const res = await this.httpClient.get<IncidentsResponse>(
      'incidents/export',
      {params}
    );
    for (const item of res.data.incidents) {
      incidents.push(item);
    }
    return incidents;
  }

  async *getIncidents(lastUpdatedAt?: string): AsyncGenerator<Incident> {
    const ownerIDs = await this.listOwnerID(this.incident_owner_id);
    for (const ownerID of ownerIDs) {
      for (const incident of await this.fetchIncidentsWithOwnerID(
        ownerID,
        lastUpdatedAt
      )) {
        yield incident;
      }
    }
  }

  async *getEvents(): AsyncGenerator<Event> {
    for await (const incident of this.getIncidents()) {
      if (this.eventIncidentId && incident.id === this.eventIncidentId) {
        yield* this.fetchOwnersEvents(incident);
        break;
      } else if (!this.eventIncidentId) {
        yield* this.fetchOwnersEvents(incident);
      }
    }
  }

  private async *fetchOwnersEvents(incident: Incident): AsyncGenerator<Event> {
    for (const ownerID of await this.listOwnerID(this.event_owner_id)) {
      yield* this.fetchIncidentsEvents(incident, ownerID);
    }
  }

  private async *fetchIncidentsEvents(
    incident: Incident,
    ownerID: string
  ): AsyncGenerator<Event> {
    const eventUrl = `incidents/${incident.id}/events`;

    const func = async (next?: string): Promise<PaginateResponse<Event>> => {
      let res: AxiosResponse<EventListResponse>;

      if (next) {
        /** Get next url's params */
        const nextUrlParams = next.slice(next.indexOf('?'));
        res = await this.httpClient.get<EventListResponse>(
          `${eventUrl}${nextUrlParams}`
        );
      } else {
        const params: {owner_id: string; deduped?: boolean} = {
          owner_id: ownerID,
        };
        if (typeof this.eventDeduped === 'boolean') {
          params.deduped = this.eventDeduped;
        }
        res = await this.httpClient.get<EventListResponse>(eventUrl, {params});
      }

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

  @Memoize()
  async getServices(): Promise<ReadonlyArray<Service>> {
    const res = await this.httpClient.get<ServiceResponse>('services');
    const services = [];
    for (const item of res.data.data) {
      if (this.services.length === 0 || this.services.includes(item.slug)) {
        services.push(item);
      }
    }
    return services;
  }

  async *getUsers(): AsyncGenerator<User> {
    const res = await this.httpClient.get<UserResponse>('users');
    for (const item of res.data.data) {
      yield item;
    }
  }

  private async *getTeams(): AsyncGenerator<User> {
    const res = await this.httpClient.get<UserResponse>('teams');
    for (const item of res.data.data) {
      yield item;
    }
  }
}
