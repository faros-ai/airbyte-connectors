import {Octokit} from '@octokit/rest';
import {GetResponseDataTypeFromEndpointMethod} from '@octokit/types';

import {
  CommitsQuery,
  EnterpriseQuery,
  IssuesQuery,
  LabelsQuery,
  ListMembersQuery,
  ListSamlSsoUsersQuery,
  ProjectsQuery,
  PullRequestsQuery,
  RepoTagsQuery,
} from './generated';

const octokit: Octokit = new Octokit();

export type AppInstallation = GetResponseDataTypeFromEndpointMethod<
  typeof octokit.apps.listInstallations
>[0];

export type Organization = Pick<
  GetResponseDataTypeFromEndpointMethod<typeof octokit.orgs.get>,
  'login' | 'name' | 'type' | 'html_url' | 'created_at' | 'updated_at'
>;

export type Repository = {
  org: string;
  tmsEnabled?: boolean;
  syncRepoData?: boolean;
  recentPush?: boolean;
  languages?: {language: string; bytes: number}[];
} & Pick<
  GetResponseDataTypeFromEndpointMethod<typeof octokit.repos.listForOrg>[0],
  | 'name'
  | 'full_name'
  | 'private'
  | 'description'
  | 'language'
  | 'size'
  | 'default_branch'
  | 'html_url'
  | 'topics'
  | 'created_at'
  | 'updated_at'
  | 'pushed_at'
  | 'archived'
>;

export type PullRequestNode =
  PullRequestsQuery['repository']['pullRequests']['nodes'][0];

export type CoverageReport = {
  coveragePercentage: number;
  createdAt: Date;
  commitSha: string;
};

export type PullRequest = {
  org: string;
  repo: string;
  coverage?: CoverageReport;
} & Omit<PullRequestNode, 'labels' | 'files' | 'reviews' | 'reviewRequests'> & {
    labels: PullRequestNode['labels']['nodes'];
    files: PullRequestNode['files']['nodes'];
    reviews: PullRequestNode['reviews']['nodes'];
    reviewRequests: PullRequestNode['reviewRequests']['nodes'];
  };

export type PullRequestLabel = PullRequestNode['labels']['nodes'][0];

export type PullRequestFile = PullRequestNode['files']['nodes'][0];

type PullRequestCommentNode = GetResponseDataTypeFromEndpointMethod<
  typeof octokit.pulls.listReviewCommentsForRepo
>[0];

export type PullRequestComment = {
  repository: string;
  user: Pick<
    PullRequestCommentNode['user'],
    'login' | 'name' | 'email' | 'html_url' | 'type'
  >;
} & Pick<
  PullRequestCommentNode,
  'id' | 'body' | 'created_at' | 'updated_at' | 'pull_request_url' | 'html_url'
>;

export type PullRequestReview = PullRequestNode['reviews']['nodes'][0];

export type PullRequestReviewRequest =
  PullRequestNode['reviewRequests']['nodes'][0];

export type Label = {
  org: string;
  repo: string;
  tmsEnabled?: boolean;
} & LabelsQuery['repository']['labels']['nodes'][0];

type CommitsQueryCommitNode = NonNullable<
  CommitsQuery['repository']['ref']['target'] & {type: 'Commit'}
>['history']['nodes'][0];

export type Commit = {
  org: string;
  repo: string;
  branch: string;
  changedFiles?: number;
  changedFilesIfAvailable?: number;
} & CommitsQueryCommitNode;

export type User = {
  org: string;
} & ListMembersQuery['organization']['membersWithRole']['nodes'][0];

export type Team = {
  org: string;
  parentSlug: string | null;
} & Pick<
  GetResponseDataTypeFromEndpointMethod<typeof octokit.teams.list>[0],
  'name' | 'slug' | 'description'
>;

export type TeamMembership = {
  org: string;
  team: string;
  user_login: string;
  user: Pick<
    GetResponseDataTypeFromEndpointMethod<
      typeof octokit.teams.listMembersInOrg
    >[0],
    'login' | 'name' | 'email' | 'html_url' | 'type'
  >;
};

export type OutsideCollaborator = {
  org: string;
} & Pick<
  GetResponseDataTypeFromEndpointMethod<
    typeof octokit.orgs.listOutsideCollaborators
  >[0],
  'name' | 'login' | 'email' | 'type' | 'html_url'
>;

export type SamlSsoUser = {
  org: string;
  user_login: string;
} & ListSamlSsoUsersQuery['organization']['samlIdentityProvider']['externalIdentities']['nodes'][0];

export type Tag = {
  repository: string;
  name: string;
  commit_sha: string;
  commit: TagsQueryCommitNode;
};

export type TagsQueryCommitNode = Extract<
  RepoTagsQuery['repository']['refs']['nodes'][0]['target'],
  {type: 'Commit'}
>;

type ReleaseNode = GetResponseDataTypeFromEndpointMethod<
  typeof octokit.repos.listReleases
>[0];

export type Release = {
  repository: string;
  html_url: string;
  author: Pick<
    ReleaseNode['author'],
    'login' | 'name' | 'email' | 'html_url' | 'type'
  >;
} & Pick<
  ReleaseNode,
  'id' | 'name' | 'body' | 'draft' | 'created_at' | 'published_at' | 'tag_name'
>;

export type Project = {
  org: string;
  id: string;
} & Pick<
  ProjectsQuery['organization']['projectsV2']['nodes'][0],
  'name' | 'body' | 'created_at' | 'updated_at'
>;

export type Issue = {
  org: string;
  repo: string;
} & IssuesQuery['repository']['issues']['nodes'][0];

export type IssueAssignment = Issue['assignments']['nodes'][0];

type IssueCommentNode = GetResponseDataTypeFromEndpointMethod<
  typeof octokit.issues.listCommentsForRepo
>[0];

export type IssueComment = {
  repository: string;
  user: Pick<
    IssueCommentNode['user'],
    'login' | 'name' | 'email' | 'html_url' | 'type'
  >;
} & Pick<
  IssueCommentNode,
  'id' | 'body' | 'created_at' | 'updated_at' | 'issue_url' | 'html_url'
>;

export type CopilotSeatsStreamRecord = CopilotSeat | CopilotSeatsEmpty;

export type CopilotSeatsResponse = GetResponseDataTypeFromEndpointMethod<
  typeof octokit.copilot.listCopilotSeats
>;

export type CopilotSeatAssignee = Pick<
  CopilotSeatsResponse['seats'][0]['assignee'],
  'login' | 'name' | 'email' | 'html_url' | 'type'
>;

export type CopilotSeat = {
  empty?: never;
  org: string;
  user: string;
  assignee: CopilotSeatAssignee;
  team?: string;
  startedAt?: string;
} & Pick<
  CopilotSeatsResponse['seats'][0],
  | 'created_at'
  | 'updated_at'
  | 'pending_cancellation_date'
  | 'last_activity_at'
  | 'plan_type'
>;

export type CopilotSeatsEmpty = {
  empty: true;
  org: string;
};

export enum ToolCategory {
  CodingAssistant = 'CodingAssistant',
}

export enum ToolDetail {
  GitHubCopilot = 'GitHubCopilot',
}

export type CopilotUsageSummary = {
  org: string;
  team: string | null;
} & {
  day: string;
  total_suggestions_count: number;
  total_acceptances_count: number;
  total_lines_suggested: number;
  total_lines_accepted: number;
  total_active_users: number;
  total_active_chat_users: number;
  total_chats: number;
  total_chat_insertion_events: number;
  total_chat_copy_events: number;
  breakdown: {
    language: string;
    editor: string;
    suggestions_count: number;
    acceptances_count: number;
    lines_suggested: number;
    lines_accepted: number;
    active_users: number;
    model_breakdown?: {
      model: string;
      suggestions_count: number;
      acceptances_count: number;
      lines_suggested: number;
      lines_accepted: number;
      active_users: number;
    }[];
  }[];
  chat_breakdown?: {
    editor: string;
    chats: number;
    chat_insertion_events: number;
    chat_copy_events: number;
    model_breakdown?: {
      model: string;
      chats: number;
      chat_insertion_events: number;
      chat_copy_events: number;
      active_chat_users: number;
    }[];
  }[];
};

export type LanguageEditorBreakdown = CopilotUsageSummary['breakdown'][0];

export type ChatBreakdown = CopilotUsageSummary['chat_breakdown'][0];

export type CodeScanningAlert = {
  org: string;
  repo: string;
} & Omit<
  GetResponseDataTypeFromEndpointMethod<
    typeof octokit.codeScanning.listAlertsForRepo
  >[0],
  'dismissed_by'
> & {
    dismissed_by: string | null;
  };

export type DependabotAlert = {
  org: string;
  repo: string;
} & Omit<
  GetResponseDataTypeFromEndpointMethod<
    typeof octokit.dependabot.listAlertsForRepo
  >[0],
  'dismissed_by'
> & {
    dismissed_by: string | null;
  };

export type SecretScanningAlert = {
  org: string;
  repo: string;
} & Omit<
  GetResponseDataTypeFromEndpointMethod<
    typeof octokit.secretScanning.listAlertsForRepo
  >[0],
  'resolved_by' | 'push_protection_bypassed_by'
> & {
    resolved_by: string | null;
    push_protection_bypassed_by: string | null;
  };

export type Workflow = {
  org: string;
  repo: string;
} & GetResponseDataTypeFromEndpointMethod<
  typeof octokit.actions.listRepoWorkflows
>['workflows'][0];

export type WorkflowRun = {
  org: string;
  repo: string;
} & Pick<
  GetResponseDataTypeFromEndpointMethod<
    typeof octokit.actions.listWorkflowRunsForRepo
  >['workflow_runs'][0],
  | 'id'
  | 'name'
  | 'head_branch'
  | 'head_sha'
  | 'path'
  | 'run_number'
  | 'event'
  | 'display_title'
  | 'status'
  | 'conclusion'
  | 'workflow_id'
  | 'url'
  | 'html_url'
  | 'created_at'
  | 'updated_at'
  | 'run_attempt'
  | 'run_started_at'
>;

export type WorkflowJob = {
  org: string;
  repo: string;
  workflow_id: number;
} & Pick<
  GetResponseDataTypeFromEndpointMethod<
    typeof octokit.actions.listJobsForWorkflowRun
  >['jobs'][0],
  | 'run_id'
  | 'id'
  | 'workflow_name'
  | 'head_branch'
  | 'run_attempt'
  | 'head_sha'
  | 'url'
  | 'html_url'
  | 'status'
  | 'conclusion'
  | 'created_at'
  | 'started_at'
  | 'completed_at'
  | 'name'
  | 'labels'
>;

export type Artifact = {
  org: string;
  repo: string;
  workflow_id: number;
  run_id: number;
} & Pick<
  GetResponseDataTypeFromEndpointMethod<
    typeof octokit.actions.listWorkflowRunArtifacts
  >['artifacts'][0],
  | 'id'
  | 'name'
  | 'size_in_bytes'
  | 'url'
  | 'archive_download_url'
  | 'expired'
  | 'created_at'
  | 'expires_at'
  | 'updated_at'
>;

export type Enterprise = EnterpriseQuery['enterprise'];

// https://docs.github.com/en/enterprise-cloud@latest/early-access/admin/articles/rest-api-endpoints-for-enterprise-teams#response-schemas
export type EnterpriseTeamsResponse = {
  slug: string;
  name: string;
}[];

// https://docs.github.com/en/enterprise-cloud@latest/early-access/admin/articles/rest-api-endpoints-for-enterprise-teams#response-schemas
export type EnterpriseTeamMembershipsResponse = {
  login: string;
  name: string;
  email: string;
  html_url: string;
  type: string;
}[];

// https://docs.github.com/en/rest/copilot/copilot-user-management?apiVersion=2022-11-28#list-all-copilot-seat-assignments-for-an-enterprise
// since it's the same schema as organization version we reuse the one from octokit
export type EnterpriseCopilotSeatsResponse =
  GetResponseDataTypeFromEndpointMethod<
    typeof octokit.copilot.listCopilotSeats
  >;

export type EnterpriseTeam = {
  enterprise: string;
} & EnterpriseTeamsResponse[0];

export type EnterpriseTeamMembership = {
  enterprise: string;
  team: string;
  user_login: string;
  user: EnterpriseTeamMembershipsResponse[0];
};

export type EnterpriseCopilotSeatsStreamRecord =
  | EnterpriseCopilotSeat
  | EnterpriseCopilotSeatsEmpty;

export type EnterpriseCopilotSeat = {
  empty?: never;
  enterprise: string;
  user: string;
  assignee: CopilotSeatAssignee;
  team?: string;
} & Pick<
  EnterpriseCopilotSeatsResponse['seats'][0],
  | 'created_at'
  | 'updated_at'
  | 'pending_cancellation_date'
  | 'last_activity_at'
  | 'plan_type'
>;

export type EnterpriseCopilotSeatsEmpty = {
  empty: true;
  enterprise: string;
};

export type EnterpriseCopilotUsageSummary = {
  enterprise: string;
  team: string | null;
} & Omit<CopilotUsageSummary, 'org' | 'team'>;

export type EnterpriseCopilotUserEngagement = {
  enterprise: string;
  date: string;
  day: string;
  login: string;
  user_id: string;
  cli_engagement: 0 | 1;
  code_completion_engagement: 0 | 1;
  code_review_engagement: 0 | 1;
  dotcom_chat_engagement: 0 | 1;
  inline_chat_engagement: 0 | 1;
  knowledge_base_chat_engagement: 0 | 1;
  mobile_chat_engagement: 0 | 1;
  panel_chat_engagement: 0 | 1;
  pull_request_summary_engagement: 0 | 1;
};
