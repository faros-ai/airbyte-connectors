import axios, {AxiosInstance, AxiosResponse} from 'axios';
import {AirbyteLogger, wrapApiError} from 'faros-airbyte-cdk';
import {Memoize} from 'typescript-memoize';
import {VError} from 'verror';

import {Incident, IncidentUpdate, Page, User} from './types';

export const BASE_URL = 'https://api.statuspage.io/v1/';

export interface StatuspageConfig {
  readonly api_key: string;
  readonly cutoff_days: number;
  readonly org_id?: string;
  readonly page_ids?: ReadonlyArray<string>;
}

export class Statuspage {
  private static statuspage: Statuspage = null;

  constructor(
    private readonly httpClient: AxiosInstance,
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
      await this.httpClient.get('/pages');
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

  async *getIncidentUpdates(cutoff?: Date): AsyncGenerator<IncidentUpdate> {
    const startTime = cutoff > this.startDate ? cutoff : this.startDate;
    for (const incident of await this.getIncidents(cutoff)) {
      for (const update of incident.incident_updates) {
        const eventTime = new Date(update.created_at);
        const eventUpdateTime = new Date(update.updated_at);
        if (eventTime > startTime || eventUpdateTime > startTime) {
          yield update;
        }
      }
    }
  }

  @Memoize((cutoff: Date) => cutoff ?? new Date(0))
  async getIncidents(cutoff?: Date): Promise<ReadonlyArray<Incident>> {
    const startTime = cutoff > this.startDate ? cutoff : this.startDate;
    const results: Incident[] = [];
    // const incidents = await this.clientV2.api.incidents.getAll();
    // if (!incidents.incidents) {
    //   throw new VError('Incorrect incidents');
    // }
    // for (const incident of incidents.incidents as Incident[]) {
    //   const resolvedAt = new Date(incident.resolved_at ?? 0);
    //   const updatedAt = new Date(incident.updated_at);
    //   if (updatedAt > startTime || resolvedAt > startTime) {
    //     results.push(incident);
    //   }
    // }
    return results;
  }

  async *getPages(pageIds?: ReadonlyArray<string>): AsyncGenerator<Page> {
    const response: AxiosResponse<Page[]> = await this.httpClient.get('/pages');
    for (const page of response.data) {
      if (pageIds && pageIds.length > 0 && !pageIds.includes(page.id)) {
        continue;
      }
      yield page;
    }
  }

  async *getUsers(orgId?: string): AsyncGenerator<User> {
    if (orgId) {
      const response: AxiosResponse<User[]> = await this.httpClient.get(
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
