import {AxiosInstance} from 'axios';
import {AirbyteLogger} from 'faros-airbyte-cdk';
import {makeAxiosInstanceWithRetry} from 'faros-js-client';
import {Memoize} from 'typescript-memoize';
import VError from 'verror';

import {
  AutocompleteAnalyticsItem,
  CascadeAnalyticsRequest,
  CascadeAnalyticsResponse,
  CascadeDataSource,
  CascadeLinesItem,
  CustomAnalyticsRequest,
  CustomAnalyticsResponse,
  QueryAggregationFunction,
  QueryDataSource,
  QueryFilter,
  UserPageAnalyticsResponse,
  UserTableStatsItem,
  WindsurfConfig,
} from './types';

export const DEFAULT_WINDSURF_API_URL = 'https://server.codeium.com/api/v1';
export const DEFAULT_TIMEOUT = 60000;

export class Windsurf {
  private static windsurf: Windsurf;
  private readonly api: AxiosInstance;
  private readonly apiKeyToEmailMap: Record<string, string> = {};

  constructor(
    private readonly config: WindsurfConfig,
    private readonly logger: AirbyteLogger
  ) {
    const apiUrl = config.windsurf_api_url ?? DEFAULT_WINDSURF_API_URL;
    this.api = makeAxiosInstanceWithRetry({
      baseURL: apiUrl,
      timeout: config.timeout ?? DEFAULT_TIMEOUT,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  static instance(config: WindsurfConfig, logger: AirbyteLogger): Windsurf {
    if (!Windsurf.windsurf) {
      Windsurf.windsurf = new Windsurf(config, logger);
    }
    return Windsurf.windsurf;
  }

  async checkConnection(): Promise<void> {
    try {
      await this.getUserPageAnalytics();
    } catch (error: any) {
      throw new VError(
        error,
        'Failed to connect to Windsurf API. Please check your service key.'
      );
    }
  }

  @Memoize()
  async getUserPageAnalytics(): Promise<UserTableStatsItem[]> {
    try {
      const response = await this.api.post<UserPageAnalyticsResponse>(
        '/UserPageAnalytics',
        {
          service_key: this.config.service_key,
        }
      );

      if (!response.data || !Array.isArray(response.data.userTableStats)) {
        throw new VError(
          'Invalid response from Windsurf API: missing userTableStats'
        );
      }

      // Build the API key to email mapping and remove apiKey from results
      const results: UserTableStatsItem[] = [];
      for (const user of response.data.userTableStats) {
        if (user.apiKey && user.email) {
          this.apiKeyToEmailMap[user.apiKey] = user.email;
        }
        // Remove apiKey from the emitted record
        const {apiKey, ...userWithoutApiKey} = user;
        results.push(userWithoutApiKey as UserTableStatsItem);
      }

      return results;
    } catch (error: any) {
      if (error.response?.status === 401) {
        throw new VError('Invalid service key or insufficient permissions');
      } else if (error.response?.status === 403) {
        throw new VError(
          'Service key does not have Teams Read-only permissions'
        );
      }
      throw error;
    }
  }

  async *getAutocompleteAnalytics(
    startDate?: string,
    endDate?: string
  ): AsyncGenerator<AutocompleteAnalyticsItem> {
    // Ensure we have the email mapping first
    await this.getUserPageAnalytics();

    const request: CustomAnalyticsRequest = {
      service_key: this.config.service_key,
      query_requests: [
        {
          data_source: QueryDataSource.USER_DATA,
          selections: [
            {field: 'api_key'},
            {field: 'date'},
            {
              field: 'num_acceptances',
              aggregation_function: QueryAggregationFunction.SUM,
            },
            {
              field: 'num_lines_accepted',
              aggregation_function: QueryAggregationFunction.SUM,
            },
            {
              field: 'num_bytes_accepted',
              aggregation_function: QueryAggregationFunction.SUM,
            },
            {field: 'language'},
            {field: 'ide'},
            {field: 'version'},
          ],
          filters: [],
        },
      ],
    };

    // Add date filters if provided
    if (startDate) {
      request.query_requests[0].filters.push({
        name: 'date',
        filter: QueryFilter.GREATER_EQUAL,
        value: startDate,
      });
    }
    if (endDate) {
      request.query_requests[0].filters.push({
        name: 'date',
        filter: QueryFilter.LESS_EQUAL,
        value: endDate,
      });
    }

    try {
      const response = await this.api.post<CustomAnalyticsResponse>(
        '/Analytics',
        request
      );

      if (!response.data?.queryResults?.[0]?.responseItems) {
        throw new VError('Invalid response from Windsurf Analytics API');
      }

      for (const responseItem of response.data.queryResults[0].responseItems) {
        const item = responseItem.item;
        const apiKey = item.api_key;

        // Map api_key to email - skip records without email mapping
        const email = this.apiKeyToEmailMap[apiKey];
        if (!email) {
          continue; // Skip this record if we can't map to an email
        }

        yield {
          email,
          date: item.date,
          num_acceptances: item.num_acceptances
            ? parseInt(item.num_acceptances, 10)
            : undefined,
          num_lines_accepted: item.num_lines_accepted
            ? parseInt(item.num_lines_accepted, 10)
            : undefined,
          num_bytes_accepted: item.num_bytes_accepted
            ? parseInt(item.num_bytes_accepted, 10)
            : undefined,
          language: item.language,
          ide: item.ide,
          version: item.version,
        };
      }
    } catch (error: any) {
      if (error.response?.status === 401) {
        throw new VError(
          'Invalid service key or insufficient permissions for Analytics API'
        );
      }
      throw new VError(error, 'Failed to fetch autocomplete analytics');
    }
  }

  async *getCascadeLinesAnalytics(
    startDate?: string,
    endDate?: string
  ): AsyncGenerator<CascadeLinesItem> {
    // Ensure we have the user list first
    const users = await this.getUserPageAnalytics();

    // Query cascade analytics for each user individually
    for (const user of users) {
      if (!user.email) {
        continue; // Skip users without email
      }

      const request: CascadeAnalyticsRequest = {
        service_key: this.config.service_key,
        emails: [user.email], // Query for single user
        query_requests: [
          {
            data_source: CascadeDataSource.CASCADE_LINES,
          },
        ],
      };

      // Add date filters if provided
      if (startDate) {
        request.start_timestamp = startDate;
      }
      if (endDate) {
        request.end_timestamp = endDate;
      }

      try {
        const response = await this.api.post<CascadeAnalyticsResponse>(
          '/CascadeAnalytics',
          request
        );

        if (response.data?.queryResults?.[0]?.cascadeLines?.cascadeLines) {
          for (const cascadeLineItem of response.data.queryResults[0]
            .cascadeLines.cascadeLines) {
            yield {
              email: user.email, // Add email since API response won't include it
              day: cascadeLineItem.day,
              linesSuggested: cascadeLineItem.linesSuggested
                ? parseInt(cascadeLineItem.linesSuggested, 10)
                : undefined,
              linesAccepted: cascadeLineItem.linesAccepted
                ? parseInt(cascadeLineItem.linesAccepted, 10)
                : undefined,
            };
          }
        }
      } catch (error: any) {
        // Log warning but continue with other users
        this.logger.warn(
          `Failed to fetch cascade analytics for user ${user.email}: ${error.message}`
        );
        continue;
      }
    }
  }
}
