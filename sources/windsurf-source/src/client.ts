import {AxiosInstance} from 'axios';
import {AirbyteLogger, wrapApiError} from 'faros-airbyte-cdk';
import {makeAxiosInstanceWithRetry} from 'faros-js-client';
import {Memoize} from 'typescript-memoize';
import {VError} from 'verror';

import {WindsurfConfig} from './config';
import {UserData, ChatData, CommandData, PCWData} from './models';

export const MIN_DATE = new Date(0).toISOString();
export const MAX_DATE = new Date(7258118400000).toISOString();

const DEFAULT_BASE_URL = 'https://api.windsurf.com';
const DEFAULT_CUTOFF_DAYS = 90;
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_API_TIMEOUT_MS = 0;
const DEFAULT_RETRIES = 3;

export class WindsurfClient {
  private static client: WindsurfClient;

  constructor(
    private readonly httpClient: AxiosInstance,
    private readonly startDate: string,
    private readonly endDate: string,
    private readonly pageSize: number
  ) {}

  static instance(config: WindsurfConfig, logger?: AirbyteLogger): WindsurfClient {
    if (WindsurfClient.client) return WindsurfClient.client;

    if (!config.service_key) {
      throw new VError('Please provide a Windsurf service key.');
    }

    let startDate: string;
    let endDate: string;

    if (config.start_date || config.end_date) {
      startDate = config.start_date ?? MIN_DATE;
      endDate = config.end_date ?? MAX_DATE;
    } else {
      const cutoffDays = config.cutoff_days ?? DEFAULT_CUTOFF_DAYS;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - cutoffDays);
      startDate = cutoffDate.toISOString();
      endDate = new Date().toISOString();
    }

    const httpClient = makeAxiosInstanceWithRetry(
      {
        baseURL: config.base_url ?? DEFAULT_BASE_URL,
        timeout: config.api_timeout ?? DEFAULT_API_TIMEOUT_MS,
        maxContentLength: Infinity,
        headers: {
          'Authorization': `Bearer ${config.service_key}`,
          'Content-Type': 'application/json',
        },
      },
      logger?.asPino(),
      config.max_retries ?? DEFAULT_RETRIES,
      10000
    );

    WindsurfClient.client = new WindsurfClient(
      httpClient,
      startDate,
      endDate,
      config.page_size ?? DEFAULT_PAGE_SIZE
    );

    return WindsurfClient.client;
  }

  async checkConnection(): Promise<void> {
    try {
      await this.httpClient.get('/analytics/user-data', {
        params: { limit: 1 }
      });
    } catch (err: any) {
      let errorMessage = 'Please verify your service key. Error: ';
      try {
        errorMessage += err.message ?? err.statusText ?? wrapApiError(err);
      } catch (wrapError: any) {
        errorMessage += wrapError.message;
      }
      throw new VError(errorMessage);
    }
  }

  async *getUserData(since?: string): AsyncGenerator<UserData> {
    const start = since ?? this.startDate;
    let offset = 0;

    while (true) {
      const res = await this.httpClient.get('/analytics/user-data', {
        params: {
          start_date: start,
          end_date: this.endDate,
          limit: this.pageSize,
          offset: offset
        }
      });

      if (!Array.isArray(res.data?.data) || res.data.data.length === 0) {
        break;
      }

      for (const item of res.data.data) {
        yield item;
      }

      if (res.data.data.length < this.pageSize) {
        break;
      }

      offset += this.pageSize;
    }
  }

  async *getChatData(since?: string): AsyncGenerator<ChatData> {
    const start = since ?? this.startDate;
    let offset = 0;

    while (true) {
      const res = await this.httpClient.get('/analytics/chat-data', {
        params: {
          start_date: start,
          end_date: this.endDate,
          limit: this.pageSize,
          offset: offset
        }
      });

      if (!Array.isArray(res.data?.data) || res.data.data.length === 0) {
        break;
      }

      for (const item of res.data.data) {
        yield item;
      }

      if (res.data.data.length < this.pageSize) {
        break;
      }

      offset += this.pageSize;
    }
  }

  async *getCommandData(since?: string): AsyncGenerator<CommandData> {
    const start = since ?? this.startDate;
    let offset = 0;

    while (true) {
      const res = await this.httpClient.get('/analytics/command-data', {
        params: {
          start_date: start,
          end_date: this.endDate,
          limit: this.pageSize,
          offset: offset
        }
      });

      if (!Array.isArray(res.data?.data) || res.data.data.length === 0) {
        break;
      }

      for (const item of res.data.data) {
        yield item;
      }

      if (res.data.data.length < this.pageSize) {
        break;
      }

      offset += this.pageSize;
    }
  }

  async *getPCWData(since?: string): AsyncGenerator<PCWData> {
    const start = since ?? this.startDate;
    let offset = 0;

    while (true) {
      const res = await this.httpClient.get('/analytics/pcw-data', {
        params: {
          start_date: start,
          end_date: this.endDate,
          limit: this.pageSize,
          offset: offset
        }
      });

      if (!Array.isArray(res.data?.data) || res.data.data.length === 0) {
        break;
      }

      for (const item of res.data.data) {
        yield item;
      }

      if (res.data.data.length < this.pageSize) {
        break;
      }

      offset += this.pageSize;
    }
  }
}
