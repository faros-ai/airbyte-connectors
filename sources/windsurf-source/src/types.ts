export interface WindsurfConfig {
  readonly service_key: string;
  readonly windsurf_api_url?: string;
  readonly timeout?: number;
}

export interface UserPageAnalyticsRequest {
  service_key: string;
}

// Re-export stream record types from faros-airbyte-common
export {
  UserTableStatsItem,
  AutocompleteAnalyticsItem,
} from 'faros-airbyte-common/windsurf';

// Import types for local use
import {UserTableStatsItem} from 'faros-airbyte-common/windsurf';

// API request/response types (source-specific implementation details)
export interface UserPageAnalyticsResponse {
  userTableStats: UserTableStatsItem[];
}

export enum QueryDataSource {
  USER_DATA = 'QUERY_DATA_SOURCE_USER_DATA',
  CHAT_DATA = 'QUERY_DATA_SOURCE_CHAT_DATA',
  COMMAND_DATA = 'QUERY_DATA_SOURCE_COMMAND_DATA',
  PCW_DATA = 'QUERY_DATA_SOURCE_PCW_DATA',
}

export enum QueryAggregationFunction {
  SUM = 'QUERY_AGGREGATION_SUM',
  COUNT = 'QUERY_AGGREGATION_COUNT',
  AVG = 'QUERY_AGGREGATION_AVG',
  MAX = 'QUERY_AGGREGATION_MAX',
  MIN = 'QUERY_AGGREGATION_MIN',
}

export enum QueryFilter {
  EQUAL = 'QUERY_FILTER_EQUAL',
  NOT_EQUAL = 'QUERY_FILTER_NOT_EQUAL',
  GREATER = 'QUERY_FILTER_GREATER',
  GREATER_EQUAL = 'QUERY_FILTER_GREATER_EQUAL',
  LESS = 'QUERY_FILTER_LESS',
  LESS_EQUAL = 'QUERY_FILTER_LESS_EQUAL',
}

export interface QuerySelection {
  field: string;
  aggregation_function?: QueryAggregationFunction;
  name?: string;
}

export interface QueryAggregation {
  field: string;
  name: string;
}

export interface QueryFilterItem {
  name: string;
  filter: QueryFilter;
  value: string;
}

export interface QueryRequest {
  data_source: QueryDataSource;
  selections: QuerySelection[];
  aggregations?: QueryAggregation[];
  filters?: QueryFilterItem[];
}

export interface CustomAnalyticsRequest {
  service_key: string;
  query_requests: QueryRequest[];
}

export interface CustomAnalyticsResponseItem {
  item: Record<string, string>;
}

export interface QueryResult {
  responseItems: CustomAnalyticsResponseItem[];
}

export interface CustomAnalyticsResponse {
  queryResults: QueryResult[];
}
