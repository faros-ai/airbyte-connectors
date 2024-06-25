import {Octokit} from '@octokit/rest';
import {GetResponseDataTypeFromEndpointMethod} from '@octokit/types';

const octokit: Octokit = new Octokit();

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

export type CopilotUsageSummary = {
  org: string;
} & GetResponseDataTypeFromEndpointMethod<
  typeof octokit.copilot.usageMetricsForOrg
>[0];

export type LanguageEditorBreakdown = CopilotUsageSummary['breakdown'][0];
