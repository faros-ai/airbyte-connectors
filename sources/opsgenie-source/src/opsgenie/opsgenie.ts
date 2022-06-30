import axios, {AxiosInstance, AxiosResponse} from 'axios';
import {AirbyteLogger, wrapApiError} from 'faros-airbyte-cdk';
import {VError} from 'verror';

import {
  Incident,
  IncidentTimeLinePaginateResponse,
  PaginateResponse,
  Team,
  User,
} from './models';

const DEFAULT_PAGE_SIZE = 10;
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
    private readonly logger: AirbyteLogger,
    private readonly pageSize?: number
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
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - config.cutoff_days);
    OpsGenie.opsGenie = new OpsGenie(httpClient, startDate, logger, pageSize);
    logger.debug('Created OpsGenie instance');
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
  async retryApi<T>(url: string): Promise<AxiosResponse> {
    let attemptCount = 0;
    do {
      const response = await this.restClient.get<T>(url);
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
    let offset = 0;

    const serviceMap = new Map<string, string>();

    do {
      const response = await this.retryApi<PaginateResponse<Incident>>(
        `v1/incidents?sort=createdAt&order=asc&limit=${this.pageSize}&offset=${offset}`
      );
      for (const incident of response?.data?.data ?? []) {
        if (new Date(incident.createdAt) >= startTimeMax) {
          const incidentItem = incident;
          const timeLineResponse =
            await this.restClient.get<IncidentTimeLinePaginateResponse>(
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

  async *getUsers(): AsyncGenerator<User> {
    const response = await this.restClient.get<PaginateResponse<User>>(
      'v2/users'
    );
    for (const user of response.data.data) {
      yield user;
    }
  }

  async *getTeams(): AsyncGenerator<Team> {
    const response = await this.restClient.get<PaginateResponse<Team>>(
      'v2/teams'
    );
    for (const team of response.data.data) {
      yield team;
    }
  }
}
