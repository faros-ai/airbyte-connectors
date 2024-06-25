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
