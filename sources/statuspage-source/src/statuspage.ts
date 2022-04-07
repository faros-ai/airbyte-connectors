import axios, {AxiosInstance, AxiosResponse} from 'axios';
import {AirbyteLogger, wrapApiError} from 'faros-airbyte-cdk';
import {
  Component,
  Incident as ClientIncident,
  IncidentUpdate,
  Statuspage as StatuspageClient,
} from 'statuspage.io';
export {IncidentUpdate} from 'statuspage.io';
import {Memoize} from 'typescript-memoize';
import {VError} from 'verror';

export interface User {
  readonly id: string;
  readonly first_name: string;
  readonly last_name: string;
  readonly updated_at: string; // date-time
  readonly created_at: string; // date-time
  readonly email: string;
  readonly organization_id: string;
}

export interface Incident extends ClientIncident {
  components: Component[];
  postmortem_body: string;
}

export const BASE_URL = 'https://api.statuspage.io/v1/';

export interface StatuspageConfig {
  readonly api_key: string;
  readonly cutoff_days: number;
  readonly org_id?: string;
  readonly page_id: string;
}

export class Statuspage {
  private static statuspage: Statuspage = null;

  constructor(
    private readonly clientV2: StatuspageClient,
    private readonly httpClient: AxiosInstance,
    private readonly startDate: Date,
    private readonly orgId?: string
  ) {}

  static instance(config: StatuspageConfig, logger: AirbyteLogger): Statuspage {
    if (Statuspage.statuspage) return Statuspage.statuspage;

    if (!config.api_key) {
      throw new VError('api_key must be a not empty string');
    }
    if (!config.page_id) {
      throw new VError('page_id must be a not empty string');
    }
    if (!config.cutoff_days) {
      throw new VError('cutoff_days is null or empty');
    }
    const clientV2 = new StatuspageClient(config.page_id);
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
      clientV2,
      httpClient,
      startDate,
      config.org_id
    );
    logger.debug('Created Statuspage instance');

    return Statuspage.statuspage;
  }

  async checkConnection(): Promise<void> {
    try {
      await this.clientV2.api.incidents.getAll();

      if (this.orgId) {
        const usersResource = `/organizations/${this.orgId}/users`;
        await this.httpClient.get(usersResource);
      }
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
    const incidents = await this.clientV2.api.incidents.getAll();
    if (!incidents.incidents) {
      throw new VError('Incorrect incidents');
    }
    for (const incident of incidents.incidents as Incident[]) {
      const resolvedAt = new Date(incident.resolved_at ?? 0);
      const updatedAt = new Date(incident.updated_at);
      if (updatedAt > startTime || resolvedAt > startTime) {
        results.push(incident);
      }
    }
    return results;
  }

  async *getUsers(cutoff?: Date): AsyncGenerator<User> {
    const startTime = cutoff > this.startDate ? cutoff : this.startDate;
    const usersResource = `/organizations/${this.orgId}/users`;

    if (this.orgId) {
      const response: AxiosResponse = await this.httpClient.get(usersResource);
      for (const user of response.data) {
        if (new Date(user.updated_at) > startTime) {
          yield user;
        }
      }
    } else {
      return undefined;
    }
  }
}
