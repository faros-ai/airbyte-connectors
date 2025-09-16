import {AxiosInstance} from 'axios';
import {AirbyteLogger} from 'faros-airbyte-cdk';
import {makeAxiosInstanceWithRetry} from 'faros-js-client';
import {DateTime} from 'luxon';
import VError from 'verror';

import {
  ClaudeConfig,
  UsageReportItem,
  UsageReportResponse,
  UserItem,
  UsersResponse,
} from './types';

export const DEFAULT_ANTHROPIC_API_URL = 'https://api.anthropic.com';
export const DEFAULT_CUTOFF_DAYS = 365;
export const DEFAULT_TIMEOUT = 60000;
export const DEFAULT_PAGE_SIZE = 100;

export class Claude {
  private static claude: Claude;
  private readonly api: AxiosInstance;

  constructor(
    private readonly config: ClaudeConfig,
    private readonly logger: AirbyteLogger
  ) {
    const apiUrl = this.config.anthropic_api_url ?? DEFAULT_ANTHROPIC_API_URL;
    this.api = makeAxiosInstanceWithRetry({
      baseURL: apiUrl,
      timeout: this.config.timeout ?? DEFAULT_TIMEOUT,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      headers: {
        'x-api-key': this.config.anthropic_api_key,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
    });
  }

  static instance(config: ClaudeConfig, logger: AirbyteLogger): Claude {
    if (!Claude.claude) {
      Claude.claude = new Claude(config, logger);
    }
    return Claude.claude;
  }

  async checkConnection(): Promise<void> {
    try {
      const startDate = DateTime.now().minus({days: 1}).toFormat('yyyy-MM-dd');
      const params = new URLSearchParams({
        starting_at: startDate,
        limit: '1',
      });

      await this.api.get(
        `/v1/organizations/usage_report/claude_code?${params.toString()}`
      );
    } catch (error: any) {
      throw new VError(
        error,
        'Failed to connect to Claude Code API. Please check your API key and configuration.'
      );
    }
  }

  async *getUsageReport(
    startDate: string,
    pageSize: number = DEFAULT_PAGE_SIZE
  ): AsyncGenerator<UsageReportItem> {
    let nextPage: string | undefined = undefined;
    let hasMore = true;

    while (hasMore) {
      const params = new URLSearchParams({
        starting_at: startDate,
        limit: pageSize.toString(),
      });

      if (nextPage) {
        params.append('page', nextPage);
      }

      const res = await this.api.get<UsageReportResponse>(
        `/v1/organizations/usage_report/claude_code?${params.toString()}`
      );

      for (const item of res.data.data) {
        yield item;
      }

      hasMore = res.data.has_more;
      nextPage = res.data.next_page;
    }
  }

  async *getUsers(
    pageSize: number = DEFAULT_PAGE_SIZE
  ): AsyncGenerator<UserItem> {
    let afterId: string | undefined = undefined;
    let hasMore = true;

    while (hasMore) {
      const params = new URLSearchParams({
        limit: pageSize.toString(),
      });

      if (afterId) {
        params.append('after_id', afterId);
      }

      const res = await this.api.get<UsersResponse>(
        `/v1/organizations/users?${params.toString()}`
      );

      for (const user of res.data.data) {
        yield user;
      }

      hasMore = res.data.has_more;
      afterId = res.data.last_id;
    }
  }
}
