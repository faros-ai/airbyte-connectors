import axios, {AxiosInstance} from 'axios';
import {AirbyteLogger, wrapApiError} from 'faros-airbyte-cdk';
import {VError} from 'verror';

import {
  Incident,
  IncidentEvent,
  PageInfo,
  PaginateResponse,
  Team,
  User,
} from './models';

const DEFAULT_PAGE_SIZE = 10;
const DEFAULT_VERSION = 'v1';
const DEFAULT_BASE_URL = 'https://api.firehydrant.io/';

export interface FireHydrantConfig {
  readonly token: string;
  readonly page_size?: number;
  readonly version?: string;
}

export class FireHydrant {
  private static fireHydrant: FireHydrant = null;

  constructor(
    private readonly restClient: AxiosInstance,
    private readonly pageSize?: number
  ) {}

  static instance(
    config: FireHydrantConfig,
    logger: AirbyteLogger
  ): FireHydrant {
    if (FireHydrant.fireHydrant) return FireHydrant.fireHydrant;

    if (!config.token) {
      throw new VError('API Access token has to be provided');
    }
    const auth = `Bearer ${config.token}`;

    const version = config.version ?? DEFAULT_VERSION;
    const httpClient = axios.create({
      baseURL: `${DEFAULT_BASE_URL}${version}`,
      timeout: 5000,
      headers: {authorization: auth},
    });

    const pageSize = config.page_size ?? DEFAULT_PAGE_SIZE;

    FireHydrant.fireHydrant = new FireHydrant(httpClient, pageSize);
    logger.debug('Created FireHydrant instance');
    return FireHydrant.fireHydrant;
  }

  async checkConnection(): Promise<void> {
    try {
      await this.restClient.get(`/incidents?per_page=1&page=1`);
    } catch (err: any) {
      let errorMessage = 'Please verify your token is correct. Error: ';
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
    func: (pageInfo?: PageInfo) => Promise<PaginateResponse<T>>
  ): AsyncGenerator<T> {
    let fetchNextFunc: PageInfo = undefined;

    do {
      const response = await this.errorWrapper<PaginateResponse<T>>(() =>
        func(fetchNextFunc)
      );
      if (response?.pagination?.next) fetchNextFunc = response?.pagination;
      else fetchNextFunc = null;

      for (const item of response?.data ?? []) {
        yield item;
      }
    } while (fetchNextFunc);
  }
  private getPaginateResponse<T>(data): PaginateResponse<T> {
    return {
      data: data.data,
      pagination: data.pagination,
    };
  }
  async *getIncidents(createdAt?: Date): AsyncGenerator<Incident> {
    const func = async (
      pageInfo?: PageInfo
    ): Promise<PaginateResponse<Incident>> => {
      const page = pageInfo ? pageInfo?.page + 1 : 1;
      const response = await this.restClient.get<PaginateResponse<Incident>>(
        `incidents?per_page=${this.pageSize}&page=${page}`
      );
      const incidentPaginate = {
        pagination: response.data.pagination,
        data: [],
      };
      for (const incident of response?.data.data ?? []) {
        if (!createdAt || new Date(incident.created_at) >= createdAt) {
          const eventResponse = await this.restClient.get<
            PaginateResponse<IncidentEvent>
          >(`incidents/${incident.id}/events`);
          const incidentItem = incident;
          if (eventResponse.status === 200)
            incidentItem.events = eventResponse.data.data;
          incidentPaginate.data.push(incidentItem);
        }
      }
      return this.getPaginateResponse<Incident>(incidentPaginate);
    };
    yield* this.paginate(func);
  }

  async *getUsers(): AsyncGenerator<User> {
    const func = async (
      pageInfo?: PageInfo
    ): Promise<PaginateResponse<User>> => {
      const page = pageInfo ? pageInfo?.page + 1 : 1;
      const response = await this.restClient.get<PaginateResponse<User>>(
        `users?per_page=${this.pageSize}&page=${page}`
      );
      return this.getPaginateResponse<User>(response.data);
    };
    yield* this.paginate(func);
  }

  async *getTeams(): AsyncGenerator<Team> {
    const func = async (
      pageInfo?: PageInfo
    ): Promise<PaginateResponse<Team>> => {
      const page = pageInfo ? pageInfo?.page + 1 : 1;
      const response = await this.restClient.get<PaginateResponse<Team>>(
        `teams?per_page=${this.pageSize}&page=${page}`
      );
      return this.getPaginateResponse<Team>(response.data);
    };
    yield* this.paginate(func);
  }
}
