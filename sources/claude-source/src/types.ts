import {ClaudeCodeUsageReportItem, UserItem} from 'faros-airbyte-common/claude';

export interface ClaudeConfig {
  readonly anthropic_api_key: string;
  readonly anthropic_api_url?: string;
  readonly start_date?: string;
  readonly end_date?: string;
  readonly cutoff_days?: number;
  readonly page_size?: number;
  readonly timeout?: number;
  readonly retries?: number;
  readonly retry_delay?: number;
  startDate?: Date;
  endDate?: Date;
}

export interface ClaudeCodeUsageReportResponse {
  data: ClaudeCodeUsageReportItem[];
  has_more: boolean;
  next_page?: string;
}

export interface UsersResponse {
  data: ApiUserItem[];
  first_id?: string;
  last_id?: string;
  has_more: boolean;
}

export interface ApiUserItem {
  id: string;
  email: string;
  name?: string;
  role: string;
  type: string;
  added_at: string;
}

// Re-export common types for convenience
export {ClaudeCodeUsageReportItem, UserItem};
