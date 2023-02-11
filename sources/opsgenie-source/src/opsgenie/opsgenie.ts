import axios, {AxiosInstance, AxiosResponse} from 'axios';
import {AirbyteLogger, wrapApiError} from 'faros-airbyte-cdk';
import {VError} from 'verror';

import {
  Alert,
  Incident,
  IncidentTimeLinePaginateResponse,
  PaginateResponse,
  PaginationParams,
  Team,
  User,
} from './models';

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_BASE_URL = 'https://api.opsgenie.com/';
const MAX_NUMBER_OF_RETRIES = 10;

export interface OpsGenieConfig {
  readonly api_key: string;
  readonly cutoff_days: number;
  readonly page_size?: number;
}

export class OpsGenie {
  private static opsGenie: OpsGenie = null;

  constructor(
    private readonly restClient: AxiosInstance,
    private readonly startDate: Date,
    private readonly pageSize: number,
    private readonly logger: AirbyteLogger
  ) {}

  static instance(config: OpsGenieConfig, logger: AirbyteLogger): OpsGenie {
    if (OpsGenie.opsGenie) return OpsGenie.opsGenie;

    if (!config.api_key) {
      throw new VError('API Key has to be provided');
    }
    if (!config.cutoff_days) {
      throw new VError('cutoff_days is null or empty');
    }
    const auth = `GenieKey ${config.api_key}`;

    const httpClient = axios.create({
      baseURL: `${DEFAULT_BASE_URL}`,
      timeout: 5000,
      headers: {Authorization: auth},
    });

    const pageSize = config.page_size ?? DEFAULT_PAGE_SIZE;
    if (Math.sign(pageSize) <= 0) {
      throw new VError('Please add a positive value as page size');
    }
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - config.cutoff_days);
    OpsGenie.opsGenie = new OpsGenie(httpClient, startDate, pageSize, logger);
    return OpsGenie.opsGenie;
  }

  async checkConnection(): Promise<void> {
    try {
      await this.restClient.get<any>('v2/users');
    } catch (err: any) {
      let errorMessage = 'Please verify your api key is correct. Error: ';
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
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  delay = (waitingTime) =>
    new Promise((resolve) => setTimeout(resolve, waitingTime));

  async retryApi<T>(
    url: string,
    params?: PaginationParams
  ): Promise<AxiosResponse> {
    let attemptCount = 0;
    do {
      const response = await this.restClient.get<T>(url, {params});
      // retry when got rate limiting
      if (response.status === 429) {
        attemptCount++;
        await this.delay(Math.pow(2, attemptCount) * 200);
        continue;
      }
      return response;
    } while (attemptCount < MAX_NUMBER_OF_RETRIES);
  }

  async *getIncidents(createdAt?: Date): AsyncGenerator<Incident> {
    const startTimeMax =
      createdAt > this.startDate ? createdAt : this.startDate;
    const serviceMap = new Map<string, string>();

    let offset = 0;
    do {
      const params = {offset, limit: this.pageSize, sort: 'createdAt'};
      const response = await this.retryApi<PaginateResponse<Incident>>(
        `v1/incidents`,
        params
      );
      for (const incident of response?.data?.data ?? []) {
        if (new Date(incident.createdAt) >= startTimeMax) {
          const incidentItem = incident;
          const timeLineResponse =
            await this.retryApi<IncidentTimeLinePaginateResponse>(
              `v2/incident-timelines/${incident.id}/entries`
            );
          if (timeLineResponse.status === 200)
            incidentItem.timelines = timeLineResponse.data.data.entries;
          const serviceNames: string[] = [];
          for (const serviceId of incident.impactedServices ?? []) {
            if (serviceId in serviceMap) {
              serviceNames.push(serviceMap.get(serviceId));
            } else {
              try {
                const serviceResponse = await this.retryApi<any>(
                  `v1/services/${serviceId}`
                );
                const serviceName = serviceResponse.data.data.name;
                serviceNames.push(serviceName);
                serviceMap.set(serviceId, serviceName);
              } catch (err) {
                this.logger.warn(
                  `Could not retrieve impacted service id: ${serviceId}`
                );
              }
            }
          }
          incidentItem.impactedServices = serviceNames;
          yield incidentItem;
        }
      }
      if (response?.data.totalCount > offset + this.pageSize)
        offset += this.pageSize;
      else break;
    } while (true);
  }

  async *getAlerts(createdAt?: Date): AsyncGenerator<Alert> {
    const startTimeMax =
      createdAt > this.startDate ? createdAt : this.startDate;

    let offset = 0;
    do {
      const params = {offset, limit: this.pageSize, sort: 'createdAt'};
      const response = await this.retryApi<PaginateResponse<Alert>>(
        `v2/alerts`,
        params
      );
      for (const alert of response?.data?.data ?? []) {
        if (new Date(alert.createdAt) > startTimeMax) {
          const alertItem = alert;
          yield alertItem;
        }
      }
      if (response?.data.totalCount > offset + this.pageSize)
        offset += this.pageSize;
      else break;
    } while (true);
  }

  async *getUsers(): AsyncGenerator<User> {
    let offset = 0;
    do {
      const params = {offset, limit: this.pageSize, sort: 'createdAt'};
      const response = await this.retryApi<PaginateResponse<User>>(
        'v2/users',
        params
      );
      for (const user of response.data.data) {
        yield user;
      }
      if (response?.data.totalCount > offset + this.pageSize) {
        offset += this.pageSize;
      } else {
        break;
      }
    } while (true);
  }

  async *getTeams(): AsyncGenerator<Team> {
    const response = await this.retryApi<PaginateResponse<Team>>('v2/teams');
    for (const team of response.data.data) {
      yield team;
    }
  }
}
