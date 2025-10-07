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
  num_acceptances?: number;
  num_lines_accepted?: number;
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
  chat_loc_used?: number;
  language?: string;
  ide?: string;
}
