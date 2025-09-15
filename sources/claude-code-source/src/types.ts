import {UsageReportItem, UserItem} from 'faros-airbyte-common/claude-code';

export interface ClaudeCodeConfig {
  readonly api_key: string;
  readonly api_url?: string;
  readonly start_date?: string;
  readonly end_date?: string;
  readonly cutoff_days?: number;
  readonly page_size?: number;
  readonly timeout?: number;
  startDate?: Date;
  endDate?: Date;
}

export interface UsageReportResponse {
  data: UsageReportItem[];
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
export {UsageReportItem, UserItem};
