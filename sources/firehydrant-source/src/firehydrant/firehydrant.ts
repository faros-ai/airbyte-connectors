import axios, {AxiosInstance} from 'axios';
import {AirbyteLogger, wrapApiError} from 'faros-airbyte-cdk';
import {VError} from 'verror';

import {Incident, PageInfo, PaginateResponse, Team, User} from './models';

const DEFAULT_PAGE_SIZE = 10;
const DEFAULT_VERSION = 'v1';
const DEFAULT_BASE_URL = 'https://api.firehydrant.io/';
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_CUTOFF_DAYS = 90;

// TODO: Migrate to official FireHydrant TypeScript SDK
// https://github.com/firehydrant/firehydrant-typescript-sdk

export interface FireHydrantConfig {
  readonly token: string;
  readonly cutoff_days: number;
  readonly page_size?: number;
  readonly version?: string;
  readonly timeout?: number;
}

export class FireHydrant {
  private static fireHydrant: FireHydrant = null;

  constructor(
    private readonly restClient: AxiosInstance,
    private readonly startDate: Date,
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
    const cutoffDays = config.cutoff_days || DEFAULT_CUTOFF_DAYS;

    const auth = `Bearer ${config.token}`;

    const version = config.version ?? DEFAULT_VERSION;
    const httpClient = axios.create({
      baseURL: `${DEFAULT_BASE_URL}${version}`,
      timeout: config.timeout ?? DEFAULT_TIMEOUT_MS,
      headers: {authorization: auth},
    });

    const pageSize = config.page_size ?? DEFAULT_PAGE_SIZE;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - cutoffDays);

    FireHydrant.fireHydrant = new FireHydrant(httpClient, startDate, pageSize);
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
  async *getIncidents(updatedAfter?: Date): AsyncGenerator<Incident> {
    const updatedAfterDate = updatedAfter ? updatedAfter : this.startDate;

    const func = async (
      pageInfo?: PageInfo
    ): Promise<PaginateResponse<Incident>> => {
      const page = pageInfo ? pageInfo?.page + 1 : 1;
      const updatedAfterParam = `&updated_after=${updatedAfterDate.toISOString()}`;

      const response = await this.restClient.get<PaginateResponse<Incident>>(
        `incidents?per_page=${this.pageSize}&page=${page}${updatedAfterParam}`
      );

      const incidentPaginate = {
        pagination: response.data.pagination,
        data: [],
      };

      for (const incident of response?.data.data ?? []) {
        incidentPaginate.data.push(incident);
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
