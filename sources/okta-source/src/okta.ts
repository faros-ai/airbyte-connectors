import axios, {AxiosInstance} from 'axios';
import {AirbyteLogger} from 'faros-airbyte-cdk';
import {wrapApiError} from 'faros-feeds-sdk';
import {Memoize} from 'typescript-memoize';
import {VError} from 'verror';

import {Group, LogEvent, User} from './models';

const DEFAULT_LOG_EVENTS_START_DATE = '1970-01-01T00:00:00.000Z';

export interface OktaConfig {
  readonly token: string;
  readonly domain_name: string;
  readonly version?: string;
}

export class Okta {
  private static okta: Okta = null;

  constructor(private readonly httpClient: AxiosInstance) {}

  static async instance(
    config: OktaConfig,
    logger: AirbyteLogger
  ): Promise<Okta> {
    if (Okta.okta) return Okta.okta;

    if (!config.token) {
      throw new VError('token must be a not empty string');
    }
    const version = config.version ? config.version : 'v1';
    const httpClient = axios.create({
      baseURL: `https://${config.domain_name}.okta.com/api/${version}/`,
      timeout: 5000, // default is `0` (no timeout)
      //maxContentLength: 20000, //default is 2000 bytes
      headers: {
        Authorization: `SSWS ${config.token}`,
      },
    });

    Okta.okta = new Okta(httpClient);
    logger.debug('Created Okta instance');
    return Okta.okta;
  }

  async checkConnection(): Promise<void> {
    try {
      const iter = this.getUsers();
      await iter.next();
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

  async *getUsers(): AsyncGenerator<User> {
    const res = await this.httpClient.get<User[]>('users');
    for (const item of res.data) {
      yield item;
    }
  }

  async *getGroups(): AsyncGenerator<Group> {
    const res = await this.httpClient.get<Group[]>('groups');
    for (const item of res.data) {
      yield item;
    }
  }

  @Memoize(
    (lastPublishedAt?: string) =>
      new Date(lastPublishedAt ?? DEFAULT_LOG_EVENTS_START_DATE)
  )
  async *getLogEvents(lastPublishedAt?: string): AsyncGenerator<LogEvent> {
    const res = await this.httpClient.get<LogEvent[]>('logs');
    const startTime =
      new Date(lastPublishedAt ?? 0) > new Date(DEFAULT_LOG_EVENTS_START_DATE)
        ? new Date(lastPublishedAt)
        : new Date(DEFAULT_LOG_EVENTS_START_DATE);
    for (const item of res.data) {
      const published = new Date(item.published);
      if (published >= startTime) yield item;
    }
  }
}
