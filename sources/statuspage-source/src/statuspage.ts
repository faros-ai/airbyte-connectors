import axios, {AxiosInstance, AxiosResponse} from 'axios';
import {AirbyteLogger, wrapApiError} from 'faros-airbyte-cdk';
import {VError} from 'verror';

import {Incident, Page, User} from './types';

const BASE_URL = 'https://api.statuspage.io/v1/';

export interface StatuspageConfig {
  readonly api_key: string;
  readonly cutoff_days: number;
  readonly org_id?: string;
  readonly page_ids?: ReadonlyArray<string>;
}

export class Statuspage {
  private static statuspage: Statuspage = null;

  constructor(
    private readonly api: AxiosInstance,
    private readonly startDate: Date,
    private readonly logger: AirbyteLogger
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
    Statuspage.statuspage = new Statuspage(httpClient, startDate, logger);
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

  async *getIncidents(
    pageId: string,
    lastUpdatedAt?: Date
  ): AsyncGenerator<Incident> {
    const startTime =
      lastUpdatedAt > this.startDate ? lastUpdatedAt : this.startDate;
    const response: AxiosResponse<Incident[]> = await this.api.get(
      `/pages/${pageId}/incidents`
    );
    for (const incident of response.data) {
      if (new Date(incident.updated_at ?? 0) > startTime) {
        yield incident;
      }
    }
  }

  async *getPages(pageIds?: ReadonlyArray<string>): AsyncGenerator<Page> {
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
      const response: AxiosResponse<User[]> = await this.api.get(
        `/organizations/${orgId}/users`
      );
      for (const user of response.data) {
        yield user;
      }
    } else {
      this.logger.warn('Org_id not provided. Cannot fetch Statuspage users.');
    }
  }
}
