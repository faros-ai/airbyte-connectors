import {AxiosInstance} from 'axios';
import {AirbyteLogger} from 'faros-airbyte-cdk';
import {
  ActiveMemberItem,
  AiCommitMetricItem,
  DailyUsageItem,
  InactiveMemberItem,
  MemberItem,
  UsageEventItem,
} from 'faros-airbyte-common/cursor';
import {makeAxiosInstanceWithRetry} from 'faros-js-client';
import VError from 'verror';

import {
  AiCommitMetricsResponse,
  CursorConfig,
  DailyUsageResponse,
  MembersResponse,
  UsageEventsResponse,
} from './types';

export const DEFAULT_CURSOR_API_URL = 'https://api.cursor.com';
export const DEFAULT_CUTOFF_DAYS = 365;
export const DEFAULT_TIMEOUT = 60000;
export const DEFAULT_PAGE_SIZE = 100;

export class Cursor {
  private static cursor: Cursor;
  private readonly api: AxiosInstance;
  private readonly minUsageTimestampPerEmail: {[email: string]: number} = {};

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
    if (!Cursor.cursor) {
      Cursor.cursor = new Cursor(config, logger);
    }
    return Cursor.cursor;
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
    const activeMembers: ActiveMemberItem[] = res.data.teamMembers.map(
      (member) => ({
        ...member,
        active: true,
      })
    );
    const inactiveMembers: InactiveMemberItem[] = Object.keys(
      this.minUsageTimestampPerEmail
    )
      .filter(
        (email) =>
          !res.data.teamMembers.some((member) => member.email === email)
      )
      .map((email) => ({
        email,
        active: false,
      }));
    return [...activeMembers, ...inactiveMembers];
  }

  async *getDailyUsage(
    startDate: number,
    endDate: number
  ): AsyncGenerator<DailyUsageItem> {
    const res = await this.api.post<DailyUsageResponse>(
      '/teams/daily-usage-data',
      {
        startDate,
        endDate,
      }
    );
    yield* res.data.data;
  }

  async *getUsageEvents(
    startDate: number,
    endDate: number
  ): AsyncGenerator<UsageEventItem> {
    let page = 1;
    let hasNextPage = true;

    while (hasNextPage) {
      const res = await this.api.post<UsageEventsResponse>(
        '/teams/filtered-usage-events',
        {
          startDate,
          endDate,
          page,
          pageSize: DEFAULT_PAGE_SIZE,
        }
      );

      for (const usageEvent of res.data.usageEvents) {
        if (usageEvent.userEmail) {
          this.minUsageTimestampPerEmail[usageEvent.userEmail] = Math.min(
            this.minUsageTimestampPerEmail[usageEvent.userEmail] ?? Infinity,
            Number(usageEvent.timestamp)
          );
        }
        yield usageEvent;
      }

      hasNextPage = res.data.pagination.hasNextPage;
      page++;
    }
  }

  async *getAiCommitMetrics(
    startDate: string,
    endDate: string
  ): AsyncGenerator<AiCommitMetricItem> {
    let page = 1;
    let hasNextPage = true;

    while (hasNextPage) {
      const params = new URLSearchParams({
        startDate,
        endDate,
        page: page.toString(),
        pageSize: DEFAULT_PAGE_SIZE.toString(),
      });

      try {
        const res = await this.api.get<AiCommitMetricsResponse>(
          `/analytics/ai-code/commits?${params.toString()}`
        );

        for (const commit of res.data.items) {
          yield commit;
        }

        hasNextPage = page * DEFAULT_PAGE_SIZE < res.data.totalCount;
        page++;
      } catch (error: any) {
        // Check for 401 unauthorized error indicating no enterprise access
        if (error.response?.status === 401) {
          const errorMessage =
            error.response?.data?.message ||
            'You must be a member of an enterprise team to access this resource';

          this.logger.info(
            `Cannot access AI commit metrics API: ${errorMessage}. ` +
              'An enterprise Cursor account is required to access AI code analytics.'
          );

          return;
        }

        // Re-throw other errors
        throw error;
      }
    }
  }

  getMinUsageTimestampForEmail(email: string): number | undefined {
    return this.minUsageTimestampPerEmail[email];
  }
}
