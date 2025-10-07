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
  CascadeRunsItem,
  ChatAnalyticsItem,
  CustomAnalyticsRequest,
  CustomAnalyticsResponse,
  PCWAnalyticsItem,
  QueryAggregationFunction,
  QueryDataSource,
  QueryFilter,
  UserPageAnalyticsResponse,
  UserTableStatsItem,
  WindsurfConfig,
} from './types';

export const DEFAULT_WINDSURF_API_URL = 'https://server.codeium.com/api/v1';
export const DEFAULT_CUTOFF_DAYS = 365;
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

  /**
   * Logs a curl command equivalent for an API request
   */
  private logCurlCommand(
    method: string,
    path: string,
    data?: any,
    headers?: Record<string, string>
  ): void {
    const baseUrl = this.config.windsurf_api_url ?? DEFAULT_WINDSURF_API_URL;
    const url = `${baseUrl}${path}`;

    // Build headers
    const curlHeaders = [];
    const defaultHeaders = {
      'Content-Type': 'application/json',
      ...headers,
    };

    for (const [key, value] of Object.entries(defaultHeaders)) {
      curlHeaders.push(`-H '${key}: ${value}'`);
    }

    // Build the curl command with -i for headers and -v for verbose output
    let curlCommand = `curl -i -X ${method.toUpperCase()} '${url}'`;

    if (curlHeaders.length > 0) {
      curlCommand += ' ' + curlHeaders.join(' ');
    }

    if (data) {
      // Redact service_key with $TOKEN
      const redactedData = JSON.parse(JSON.stringify(data));
      if (redactedData.service_key) {
        redactedData.service_key = '$TOKEN';
      }

      const jsonData = JSON.stringify(redactedData);
      // Escape single quotes in JSON for shell
      const escapedData = jsonData.replace(/'/g, "'\\''");
      curlCommand += ` -d '${escapedData}'`;
    }

    this.logger.debug(`Equivalent curl command: ${curlCommand}`);
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
    const requestBody = {
      service_key: this.config.service_key,
    };

    // Log the curl command
    this.logCurlCommand('POST', '/UserPageAnalytics', requestBody);

    const response = await this.api.post<UserPageAnalyticsResponse>(
      '/UserPageAnalytics',
      requestBody
    );

    // Build the API key to email mapping and keep apiKey in results
    const results: UserTableStatsItem[] = [];
    for (const user of response.data.userTableStats) {
      if (user.apiKey && user.email) {
        this.apiKeyToEmailMap[user.apiKey] = user.email;
      }
      results.push(user as UserTableStatsItem);
    }

    return results;
  }

  async *getAutocompleteAnalytics(
    email: string,
    apiKey: string,
    startDate?: Date,
    endDate?: Date
  ): AsyncGenerator<AutocompleteAnalyticsItem> {
    const request: CustomAnalyticsRequest = {
      service_key: this.config.service_key,
      query_requests: [
        {
          data_source: QueryDataSource.USER_DATA,
          aggregations: [
            {field: 'date', name: 'date'},
            {field: 'language', name: 'language'},
            {field: 'ide', name: 'ide'},
          ],
          selections: [
            {
              field: 'num_acceptances',
              aggregation_function: QueryAggregationFunction.SUM,
            },
            {
              field: 'num_lines_accepted',
              aggregation_function: QueryAggregationFunction.SUM,
            },
          ],
          filters: [
            {
              name: 'api_key',
              filter: QueryFilter.EQUAL,
              value: apiKey,
            },
          ],
        },
      ],
    };

    // Add date filters if provided
    if (startDate) {
      request.query_requests[0].filters.push({
        name: 'date',
        filter: QueryFilter.GREATER_EQUAL,
        value: startDate.toISOString().split('T')[0],
      });
    }
    if (endDate) {
      request.query_requests[0].filters.push({
        name: 'date',
        filter: QueryFilter.LESS_EQUAL,
        value: endDate.toISOString().split('T')[0],
      });
    }

    // Log the curl command
    this.logCurlCommand('POST', '/Analytics', request);

    const response = await this.api.post<CustomAnalyticsResponse>(
      '/Analytics',
      request
    );

    for (const responseItem of response.data?.queryResults?.[0]
      ?.responseItems || []) {
      const item = responseItem.item;
      yield {
        email,
        date: item.date,
        num_acceptances: item.num_acceptances
          ? parseInt(item.num_acceptances, 10)
          : undefined,
        num_lines_accepted: item.num_lines_accepted
          ? parseInt(item.num_lines_accepted, 10)
          : undefined,
        language: item.language,
        ide: item.ide,
      };
    }
  }

  async *getCascadeLinesAnalytics(
    email: string,
    startDate?: Date,
    endDate?: Date
  ): AsyncGenerator<CascadeLinesItem> {
    const request: CascadeAnalyticsRequest = {
      service_key: this.config.service_key,
      emails: [email], // Query for single user
      query_requests: [
        {
          [CascadeDataSource.CASCADE_LINES]: {},
        },
      ],
    };

    // Add date filters if provided
    if (startDate) {
      request.start_timestamp = startDate.toISOString();
    }
    if (endDate) {
      request.end_timestamp = endDate.toISOString();
    }

    // Log the curl command
    this.logCurlCommand('POST', '/CascadeAnalytics', request);

    const response = await this.api.post<CascadeAnalyticsResponse>(
      '/CascadeAnalytics',
      request
    );

    if (response.data?.queryResults?.[0]?.cascadeLines?.cascadeLines) {
      for (const cascadeLineItem of response.data.queryResults[0].cascadeLines
        .cascadeLines) {
        yield {
          email,
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
  }

  async *getCascadeRunsAnalytics(
    email: string,
    startDate?: Date,
    endDate?: Date
  ): AsyncGenerator<CascadeRunsItem> {
    const request: CascadeAnalyticsRequest = {
      service_key: this.config.service_key,
      emails: [email], // Query for single user
      query_requests: [
        {
          [CascadeDataSource.CASCADE_RUNS]: {},
        },
      ],
    };

    // Add date filters if provided
    if (startDate) {
      request.start_timestamp = startDate.toISOString();
    }
    if (endDate) {
      request.end_timestamp = endDate.toISOString();
    }

    // Log the curl command
    this.logCurlCommand('POST', '/CascadeAnalytics', request);

    const response = await this.api.post<CascadeAnalyticsResponse>(
      '/CascadeAnalytics',
      request
    );

    if (response.data?.queryResults?.[0]?.cascadeRuns?.cascadeRuns) {
      for (const cascadeRunItem of response.data.queryResults[0].cascadeRuns
        .cascadeRuns) {
        yield {
          email,
          day: cascadeRunItem.day,
          model: cascadeRunItem.model,
          mode: cascadeRunItem.mode,
          messagesSent: cascadeRunItem.messagesSent
            ? parseInt(cascadeRunItem.messagesSent, 10)
            : undefined,
          cascadeId: cascadeRunItem.cascadeId,
          promptsUsed: cascadeRunItem.promptsUsed
            ? parseInt(cascadeRunItem.promptsUsed, 10)
            : undefined,
        };
      }
    }
  }

  async *getChatAnalytics(
    email: string,
    apiKey: string,
    startDate?: Date,
    endDate?: Date
  ): AsyncGenerator<ChatAnalyticsItem> {
    const request: CustomAnalyticsRequest = {
      service_key: this.config.service_key,
      query_requests: [
        {
          data_source: QueryDataSource.USER_DATA,
          aggregations: [
            {field: 'date', name: 'date'},
            {field: 'language', name: 'language'},
            {field: 'ide', name: 'ide'},
          ],
          selections: [
            {
              field: 'chat_loc_used',
              aggregation_function: QueryAggregationFunction.SUM,
            },
          ],
          filters: [
            {
              name: 'api_key',
              filter: QueryFilter.EQUAL,
              value: apiKey,
            },
          ],
        },
      ],
    };

    // Add date filters if provided
    if (startDate) {
      request.query_requests[0].filters.push({
        name: 'date',
        filter: QueryFilter.GREATER_EQUAL,
        value: startDate.toISOString().split('T')[0],
      });
    }
    if (endDate) {
      request.query_requests[0].filters.push({
        name: 'date',
        filter: QueryFilter.LESS_EQUAL,
        value: endDate.toISOString().split('T')[0],
      });
    }

    // Log the curl command
    this.logCurlCommand('POST', '/Analytics', request);

    const response = await this.api.post<CustomAnalyticsResponse>(
      '/Analytics',
      request
    );

    for (const responseItem of response.data?.queryResults?.[0]
      ?.responseItems || []) {
      const item = responseItem.item;
      yield {
        email,
        date: item.date,
        chat_loc_used: item.chat_loc_used
          ? parseInt(item.chat_loc_used, 10)
          : undefined,
        language: item.language,
        ide: item.ide,
      };
    }
  }

  async *getPCWAnalytics(
    startDate?: Date,
    endDate?: Date
  ): AsyncGenerator<PCWAnalyticsItem> {
    const queryPCW = async (
      startTimestamp?: string,
      endTimestamp?: string,
      date?: string
    ): Promise<PCWAnalyticsItem[]> => {
      const request: CustomAnalyticsRequest = {
        service_key: this.config.service_key,
        ...(startTimestamp && {start_timestamp: startTimestamp}),
        ...(endTimestamp && {end_timestamp: endTimestamp}),
        query_requests: [
          {
            data_source: QueryDataSource.PCW_DATA,
            selections: [
              {
                field: 'percent_code_written',
                name: 'percent_code_written',
              },
              {
                field: 'codeium_bytes',
                name: 'codeium_bytes',
              },
              {
                field: 'user_bytes',
                name: 'user_bytes',
              },
              {
                field: 'total_bytes',
                name: 'total_bytes',
              },
              {
                field: 'codeium_bytes_by_autocomplete',
                name: 'codeium_bytes_by_autocomplete',
              },
              {
                field: 'codeium_bytes_by_command',
                name: 'codeium_bytes_by_command',
              },
            ],
          },
        ],
      };

      // Log the curl command
      this.logCurlCommand('POST', '/Analytics', request);

      const response = await this.api.post<CustomAnalyticsResponse>(
        '/Analytics',
        request
      );

      const results: PCWAnalyticsItem[] = [];
      for (const responseItem of response.data?.queryResults?.[0]
        ?.responseItems || []) {
        const item = responseItem.item;
        results.push({
          date: date || new Date().toISOString().split('T')[0],
          percent_code_written: item.percent_code_written
            ? parseFloat(item.percent_code_written)
            : undefined,
          codeium_bytes: item.codeium_bytes
            ? parseInt(item.codeium_bytes, 10)
            : undefined,
          user_bytes: item.user_bytes
            ? parseInt(item.user_bytes, 10)
            : undefined,
          total_bytes: item.total_bytes
            ? parseInt(item.total_bytes, 10)
            : undefined,
          codeium_bytes_by_autocomplete: item.codeium_bytes_by_autocomplete
            ? parseInt(item.codeium_bytes_by_autocomplete, 10)
            : undefined,
          codeium_bytes_by_command: item.codeium_bytes_by_command
            ? parseInt(item.codeium_bytes_by_command, 10)
            : undefined,
        });
      }
      return results;
    };

    // If no date range provided, query without timestamps
    if (!startDate || !endDate) {
      const results = await queryPCW();
      for (const result of results) {
        yield result;
      }
      return;
    }

    // Normalize dates to midnight UTC
    const normalizeDate = (date: Date): Date => {
      const normalized = new Date(date);
      normalized.setUTCHours(0, 0, 0, 0);
      return normalized;
    };

    const start = normalizeDate(startDate);
    const end = normalizeDate(endDate);

    // Iterate over each day in the date range
    // We stop when the end_timestamp would exceed the end date
    for (
      let currentDate = new Date(start);
      currentDate < end;
      currentDate.setUTCDate(currentDate.getUTCDate() + 1)
    ) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const startTimestamp = `${dateStr}T00:00:00Z`;

      // End timestamp is the next day at 00:00:00
      const nextDate = new Date(currentDate);
      nextDate.setUTCDate(nextDate.getUTCDate() + 1);
      const endTimestamp = `${nextDate.toISOString().split('T')[0]}T00:00:00Z`;

      const results = await queryPCW(startTimestamp, endTimestamp, dateStr);
      for (const result of results) {
        yield result;
      }
    }
  }
}
