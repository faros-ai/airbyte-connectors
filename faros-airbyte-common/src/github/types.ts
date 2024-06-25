export interface Organization {
  login: string;
}

export interface CopilotSeat {
  org: string;
  user: string;
  inactive: boolean;
  created_at?: string | null;
  updated_at?: string | null;
  pending_cancellation_date?: string | null;
  last_activity_at?: string | null;
}

export enum GitHubTool {
  Copilot = 'GitHubCopilot',
}

export interface CopilotUsageSummary {
  org: string;
  day: string;
  total_suggestions_count?: number;
  total_acceptances_count?: number;
  total_discards_count?: number;
  total_lines_suggested?: number;
  total_lines_accepted?: number;
  total_lines_discarded?: number;
  total_active_users?: number;
  total_chat_acceptances?: number;
  total_chat_turns?: number;
  total_active_chat_users?: number;
  breakdown: LanguageEditorBreakdown[] | null;
}

export interface LanguageEditorBreakdown {
  language?: string;
  editor?: string;
  suggestions_count?: number;
  acceptances_count?: number;
  discards_count?: number;
  lines_suggested?: number;
  lines_accepted?: number;
  lines_discarded?: number;
  active_users?: number;
}
