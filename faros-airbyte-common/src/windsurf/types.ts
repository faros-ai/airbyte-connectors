// Stream record types - data emitted by the windsurf source streams

export interface UserTableStatsItem {
  name: string;
  email: string;
  lastUpdateTime: string;
  apiKey: string;
  activeDays: number;
  disableCodeium?: boolean;
  lastAutocompleteUsageTime: string;
  lastChatUsageTime: string;
  lastCommandUsageTime: string;
}

export interface AutocompleteAnalyticsItem {
  api_key: string;
  email?: string; // Will be populated from the api_key to email mapping
  date: string;
  num_acceptances?: number;
  num_lines_accepted?: number;
  num_bytes_accepted?: number;
  language?: string;
  ide?: string;
  version?: string;
}
