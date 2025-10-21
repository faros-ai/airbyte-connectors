// Stream record types - data emitted by the claude source streams

export interface ClaudeCodeUsageReportItem {
  date: string;
  organization_id: string;
  actor_email_address?: string;
  actor: {
    email_address?: string;
    type: string;
  };
  customer_type: string;
  subscription_type: string;
  terminal_type?: string;
  core_metrics: {
    commits_by_claude_code: number;
    pull_requests_by_claude_code: number;
    lines_of_code: {
      added: number;
      removed: number;
    };
    num_sessions: number;
  };
  model_breakdown: ModelBreakdown[];
  tool_actions: {
    edit_tool?: {
      accepted: number;
      rejected: number;
    };
    multi_edit_tool?: {
      accepted: number;
      rejected: number;
    };
    notebook_edit_tool?: {
      accepted: number;
      rejected: number;
    };
    write_tool?: {
      accepted: number;
      rejected: number;
    };
  };
}

export interface ModelBreakdown {
  model: string;
  tokens: {
    input: number;
    output: number;
    cache_creation: number;
    cache_read: number;
  };
  estimated_cost: {
    amount: number;
    currency: string;
  };
}

export interface UserItem {
  id: string;
  email: string;
  name?: string;
  role: string;
  type: string;
  added_at: string;
}
