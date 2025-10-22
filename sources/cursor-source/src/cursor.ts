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
import {random} from 'lodash';
import {DateTime} from 'luxon';
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

// https://cursor.com/docs/account/teams/admin-api#get-daily-usage-data
export const MAX_DAILY_USAGE_WINDOW_DAYS = 30; // Cursor API limit

// https://cursor.com/docs/account/teams/ai-code-tracking-api
export const MAX_AI_COMMIT_METRICS_WINDOW_DAYS = 30; // Cursor API limit

export class Cursor {
  private static cursor: Cursor;
  private readonly api: AxiosInstance;
  private readonly minUsageTimestampPerEmail: {[email: string]: number} = {};

  constructor(
    private readonly config: CursorConfig,
    private readonly logger: AirbyteLogger
  ) {
    const apiUrl = this.config.cursor_api_url ?? DEFAULT_CURSOR_API_URL;
    this.api = makeAxiosInstanceWithRetry(
      {
        baseURL: apiUrl,
        timeout: this.config.timeout ?? DEFAULT_TIMEOUT,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        auth: {
          username: this.config.cursor_api_key,
          password: '',
        },
        headers: {
          'Content-Type': 'application/json',
        },
      },
      this.logger.asPino(),
      3, // retries
      (error, retryNumber) => {
        // Handle 429 rate limit errors with retry-after header
        if (error.response?.status === 429) {
          const retryAfter = error.response.headers?.['retry-after'];
          if (retryAfter) {
            const retryAfterSeconds = parseInt(retryAfter, 10);
            const delayMs = retryAfterSeconds * 1000;
            const jitter = random(0, 1000); // Add 0-1s jitter
            this.logger.debug(
              `Rate limited by Cursor API. Retry-After: ${retryAfterSeconds}s. ` +
                `Waiting ${(delayMs + jitter) / 1000}s before retry ${retryNumber}`
            );
            return delayMs + jitter;
          }
        }
        // Exponential backoff for other retryable errors
        return retryNumber * 1000;
      }
    );
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
    // Round startDate to start of day (UTC) for complete daily windows
    const roundedStartDate = DateTime.fromMillis(startDate, {zone: 'utc'})
      .startOf('day')
      .valueOf();

    const windowSizeMs = MAX_DAILY_USAGE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    let currentStart = roundedStartDate;

    while (currentStart < endDate) {
      // Calculate the end of the current window
      const currentEnd = Math.min(currentStart + windowSizeMs, endDate);

      this.logger.debug(
        `Fetching daily usage from ${new Date(currentStart).toISOString()} to ${new Date(currentEnd).toISOString()}`
      );

      const res = await this.api.post<DailyUsageResponse>(
        '/teams/daily-usage-data',
        {
          startDate: currentStart,
          endDate: currentEnd,
        }
      );

      yield* res.data.data;

      // Move to the next window
      currentStart = currentEnd;
    }
  }

  async *getUsageEvents(
    startDate: number,
    endDate: number
  ): AsyncGenerator<UsageEventItem> {
    // Round endDate to start of day (UTC) for complete daily windows
    const roundedEndDate = DateTime.fromMillis(endDate, {zone: 'utc'})
      .startOf('day')
      .valueOf();

    let page = 1;
    let hasNextPage = true;

    while (hasNextPage) {
      const res = await this.api.post<UsageEventsResponse>(
        '/teams/filtered-usage-events',
        {
          startDate,
          endDate: roundedEndDate,
          page,
          pageSize: this.config.page_size ?? DEFAULT_PAGE_SIZE,
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
    startDate: number,
    endDate: number
  ): AsyncGenerator<AiCommitMetricItem> {
    const windowSizeMs =
      MAX_AI_COMMIT_METRICS_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    let currentStart = startDate;

    while (currentStart < endDate) {
      // Calculate the end of the current window
      const currentEnd = Math.min(currentStart + windowSizeMs, endDate);

      // Convert timestamps to ISO strings for API call
      const windowStartDate = new Date(currentStart).toISOString();
      const windowEndDate = new Date(currentEnd).toISOString();

      this.logger.debug(
        `Fetching AI commit metrics from ${windowStartDate} to ${windowEndDate}`
      );

      // Paginate within each window
      let page = 1;
      let hasNextPage = true;

      while (hasNextPage) {
        const params = new URLSearchParams({
          startDate: windowStartDate,
          endDate: windowEndDate,
          page: page.toString(),
          pageSize: (this.config.page_size ?? DEFAULT_PAGE_SIZE).toString(),
        });

        try {
          const res = await this.api.get<AiCommitMetricsResponse>(
            `/analytics/ai-code/commits?${params.toString()}`
          );

          for (const commit of res.data.items) {
            yield commit;
          }

          hasNextPage =
            page * (this.config.page_size ?? DEFAULT_PAGE_SIZE) <
            res.data.totalCount;
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

      // Move to the next window
      currentStart = currentEnd;
    }
  }

  getMinUsageTimestampForEmail(email: string): number | undefined {
    return this.minUsageTimestampPerEmail[email];
  }
}
