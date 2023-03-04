import axios, {AxiosInstance, AxiosResponse} from 'axios';
import {AirbyteLogger, wrapApiError} from 'faros-airbyte-cdk';
import {VError} from 'verror';

import {Incident, Page, User} from './types';

const BASE_URL = 'https://api.statuspage.io/v1/';
const DEFAULT_PAGE_SIZE = 100;

export interface StatuspageConfig {
  readonly api_key: string;
  readonly cutoff_days: number;
  readonly org_id?: string;
  readonly page_ids?: ReadonlyArray<string>;
  readonly page_size?: number;
}

export class Statuspage {
  private static statuspage: Statuspage = null;

  constructor(
    private readonly api: AxiosInstance,
    private readonly startDate: Date,
    private readonly logger: AirbyteLogger,
    private readonly pageSize: number = DEFAULT_PAGE_SIZE
  ) {}

  static instance(config: StatuspageConfig, logger: AirbyteLogger): Statuspage {
    if (Statuspage.statuspage) return Statuspage.statuspage;

    if (!config.api_key) {
      throw new VError('api_key must not be an empty string');
    }
    if (!config.cutoff_days) {
      throw new VError('cutoff_days is null or empty');
    }
    const httpClient = axios.create({
      baseURL: BASE_URL,
      timeout: 5000, // default is `0` (no timeout)
      maxContentLength: 20000, //default is 2000 bytes
      headers: {
        Authorization: `OAuth ${config.api_key}`,
      },
    });
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - config.cutoff_days);
    Statuspage.statuspage = new Statuspage(
      httpClient,
      startDate,
      logger,
      config.page_size
    );
    return Statuspage.statuspage;
  }

  async checkConnection(): Promise<void> {
    try {
      await this.api.get('/pages');
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

  private async *paginate<T>(
    resource: string,
    pageSizeParam: string
  ): AsyncGenerator<T> {
    let page = 1;
    let morePages: boolean;
    do {
      const params = new URLSearchParams({
        page: `${page}`,
        [pageSizeParam]: `${this.pageSize}`,
      });
      const response: AxiosResponse<T[]> = await this.api.get(
        `${resource}?${params}`
      );
      for (const item of response.data) {
        yield item;
      }
      page++;
      morePages = response.data.length > 0;
    } while (morePages);
  }

  async *getIncidents(
    pageId: string,
    lastUpdatedAt?: Date
  ): AsyncGenerator<Incident> {
    const startTime =
      lastUpdatedAt > this.startDate ? lastUpdatedAt : this.startDate;
    for await (const incident of this.paginate<Incident>(
      `/pages/${pageId}/incidents`,
      'limit'
    )) {
      if (new Date(incident.updated_at ?? 0) > startTime) {
        yield incident;
      }
    }
  }

  async *getPages(pageIds?: ReadonlyArray<string>): AsyncGenerator<Page> {
    // this API does not paginated results
    const response: AxiosResponse<Page[]> = await this.api.get('/pages');
    for (const page of response.data) {
      if (pageIds && pageIds.length > 0 && !pageIds.includes(page.id)) {
        continue;
      }
      yield page;
    }
  }

  async *getUsers(orgId?: string): AsyncGenerator<User> {
    if (orgId) {
      for await (const user of this.paginate<User>(
        `/organizations/${orgId}/users`,
        'per_page'
      )) {
        yield user;
      }
    } else {
      this.logger.warn('Org_id not provided. Cannot fetch Statuspage users.');
    }
  }
}
