import {Octokit} from '@octokit/rest';
import {GetResponseDataTypeFromEndpointMethod} from '@octokit/types';

const octokit: Octokit = new Octokit();

export interface Organization {
  login: string;
}

export type CopilotSeatsStreamRecord = CopilotSeat | CopilotSeatsEmpty;

export type CopilotSeat = {
  empty?: never;
  org: string;
  user: string;
} & GetResponseDataTypeFromEndpointMethod<
  typeof octokit.copilot.listCopilotSeats
>['seats'][0];

export type CopilotSeatsEmpty = {
  empty: true;
  org: string;
};

export enum GitHubTool {
  Copilot = 'GitHubCopilot',
}

export type CopilotUsageSummary = {
  org: string;
} & GetResponseDataTypeFromEndpointMethod<
  typeof octokit.copilot.usageMetricsForOrg
>[0];

export type LanguageEditorBreakdown = CopilotUsageSummary['breakdown'][0];
