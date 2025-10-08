// Stream record types - data emitted by the windsurf source streams

export interface UserTableStatsItem {
  name: string;
  email: string;
  apiKey: string;
  signupTime: string;
  lastUpdateTime: string;
  activeDays: number;
  disableCodeium?: boolean;
  lastAutocompleteUsageTime: string;
  lastChatUsageTime: string;
  lastCommandUsageTime: string;
}

export interface AutocompleteAnalyticsItem {
  email: string; // Populated from the api_key to email mapping
  date: string;
  sum_num_acceptances?: number;
  sum_num_lines_accepted?: number;
  language?: string;
  ide?: string;
}

export interface CascadeLinesItem {
  email: string; // Added since API response won't include it
  day: string;
  linesSuggested?: number;
  linesAccepted?: number;
}

export interface CascadeRunsItem {
  email: string; // Added since API response won't include it
  day: string;
  model?: string;
  mode?: string;
  messagesSent?: number;
  cascadeId?: string;
  promptsUsed?: number;
}

export interface ChatAnalyticsItem {
  email: string; // Populated from the api_key to email mapping
  date: string;
  sum_chat_loc_used?: number;
  model_id?: string;
  ide?: string;
}

export interface PCWAnalyticsItem {
  date: string; // Date for incremental sync tracking
  percent_code_written?: number;
  codeium_bytes?: number;
  user_bytes?: number;
  total_bytes?: number;
  codeium_bytes_by_autocomplete?: number;
  codeium_bytes_by_command?: number;
}
