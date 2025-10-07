export interface WindsurfConfig {
  readonly service_key: string;
  readonly windsurf_api_url?: string;
  readonly cutoff_days?: number;
  readonly timeout?: number;
  readonly backfill?: boolean;
  readonly start_date?: string;
  readonly end_date?: string;
  startDate?: Date;
  endDate?: Date;
}

export interface UserPageAnalyticsRequest {
  service_key: string;
}

// Re-export stream record types from faros-airbyte-common
export {
  UserTableStatsItem,
  AutocompleteAnalyticsItem,
  CascadeLinesItem,
  CascadeRunsItem,
  ChatAnalyticsItem,
} from 'faros-airbyte-common/windsurf';

// Import types for local use
import {UserTableStatsItem} from 'faros-airbyte-common/windsurf';

// API response type that includes apiKey (internal use only)
interface UserTableStatsApiItem extends UserTableStatsItem {
  apiKey: string;
}

// API request/response types (source-specific implementation details)
export interface UserPageAnalyticsResponse {
  userTableStats: UserTableStatsApiItem[];
}

export enum QueryDataSource {
  USER_DATA = 'QUERY_DATA_SOURCE_USER_DATA',
  CHAT_DATA = 'QUERY_DATA_SOURCE_CHAT_DATA',
  COMMAND_DATA = 'QUERY_DATA_SOURCE_COMMAND_DATA',
  PCW_DATA = 'QUERY_DATA_SOURCE_PCW_DATA',
}

export enum QueryAggregationFunction {
  COUNT = 'QUERY_AGGREGATION_COUNT',
  SUM = 'QUERY_AGGREGATION_SUM',
  AVG = 'QUERY_AGGREGATION_AVG',
  MAX = 'QUERY_AGGREGATION_MAX',
  MIN = 'QUERY_AGGREGATION_MIN',
}

export enum QueryFilter {
  EQUAL = 'QUERY_FILTER_EQUAL',
  NOT_EQUAL = 'QUERY_FILTER_NOT_EQUAL',
  GREATER = 'QUERY_FILTER_GREATER_THAN',
  LESS = 'QUERY_FILTER_LESS_THAN',
  GREATER_EQUAL = 'QUERY_FILTER_GE',
  LESS_EQUAL = 'QUERY_FILTER_LE',
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

export enum CascadeDataSource {
  CASCADE_LINES = 'cascade_lines',
  CASCADE_RUNS = 'cascade_runs',
  CASCADE_TOOL_USAGE = 'cascade_tool_usage',
}

export interface CascadeAnalyticsRequest {
  service_key: string;
  group_name?: string;
  start_timestamp?: string;
  end_timestamp?: string;
  emails?: string[];
  ide_types?: string[];
  query_requests: CascadeQueryRequest[];
}

export interface CascadeQueryRequest {
  [CascadeDataSource.CASCADE_LINES]?: Record<string, never>;
  [CascadeDataSource.CASCADE_RUNS]?: Record<string, never>;
  [CascadeDataSource.CASCADE_TOOL_USAGE]?: Record<string, never>;
}

export interface CascadeLinesData {
  day: string;
  linesSuggested: string;
  linesAccepted: string;
}

export interface CascadeRunsData {
  day: string;
  model: string;
  mode: string;
  messagesSent: string;
  cascadeId: string;
  promptsUsed: string;
}

export interface CascadeToolUsageData {
  tool: string;
  count: string;
}

export interface CascadeQueryResult {
  cascadeLines?: {
    cascadeLines: CascadeLinesData[];
  };
  cascadeRuns?: {
    cascadeRuns: CascadeRunsData[];
  };
  cascadeToolUsage?: {
    cascadeToolUsage: CascadeToolUsageData[];
  };
}

export interface CascadeAnalyticsResponse {
  queryResults: CascadeQueryResult[];
}
