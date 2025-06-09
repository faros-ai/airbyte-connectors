import {AxiosInstance} from 'axios';
import {AirbyteLogger} from 'faros-airbyte-cdk';
import {DailyUsageItem, MemberItem} from 'faros-airbyte-common/cursor';
import {makeAxiosInstanceWithRetry} from 'faros-js-client';
import VError from 'verror';

import {CursorConfig, DailyUsageResponse, MembersResponse} from './types';

export const DEFAULT_CURSOR_API_URL = 'https://api.cursor.com';
export const DEFAULT_CUTOFF_DAYS = 90;
export const DEFAULT_TIMEOUT = 60000;

export class Cursor {
  private readonly api: AxiosInstance;

  constructor(
    config: CursorConfig,
    private readonly logger: AirbyteLogger
  ) {
    const apiUrl = config.cursor_api_url ?? DEFAULT_CURSOR_API_URL;
    this.api = makeAxiosInstanceWithRetry({
      baseURL: apiUrl,
      timeout: config.timeout ?? DEFAULT_TIMEOUT,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      auth: {
        username: config.cursor_api_key,
        password: '',
      },
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  static instance(config: CursorConfig, logger: AirbyteLogger): Cursor {
    return new Cursor(config, logger);
  }

  async checkConnection(): Promise<void> {
    try {
      await this.getMembers();
    } catch (error: any) {
      throw new VError(
        error,
        'Failed to connect to Cursor API. Please check your API key and URL.'
      );
    }
  }

  async getMembers(): Promise<MemberItem[]> {
    const res = await this.api.get<MembersResponse>('/teams/members');
    return res.data.teamMembers;
  }

  async getDailyUsage(
    startDate: number,
    endDate: number
  ): Promise<DailyUsageItem[]> {
    const res = await this.api.post<DailyUsageResponse>(
      '/teams/daily-usage-data',
      {
        startDate,
        endDate,
      }
    );
    return res.data.data;
  }
}
