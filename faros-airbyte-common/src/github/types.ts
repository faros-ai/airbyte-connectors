import {Octokit} from '@octokit/rest';
import {GetResponseDataTypeFromEndpointMethod} from '@octokit/types';

import {
  CommitsQuery,
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
  | 'archived'
>;

export type PullRequestNode =
  PullRequestsQuery['repository']['pullRequests']['nodes'][0];

export type PullRequest = {
  org: string;
  repo: string;
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
  'id' | 'body' | 'created_at' | 'updated_at' | 'pull_request_url'
>;

export type PullRequestReview = PullRequestNode['reviews']['nodes'][0];

export type PullRequestReviewRequest =
  PullRequestNode['reviewRequests']['nodes'][0];

export type Label = {
  org: string;
  repo: string;
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
} & ListSamlSsoUsersQuery['organization']['samlIdentityProvider']['externalIdentities']['nodes'][0];

export type Tag = {
  repository: string;
  name: string;
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

export type CopilotSeatsStreamRecord =
  | CopilotSeat
  | CopilotSeatEnded
  | CopilotSeatsEmpty;

export type CopilotSeat = {
  empty?: never;
  org: string;
  user: string;
  team?: string;
  teamJoinedAt?: string;
  teamLeftAt?: never;
  startedAt?: string;
  endedAt?: never;
} & Pick<
  GetResponseDataTypeFromEndpointMethod<
    typeof octokit.copilot.listCopilotSeats
  >['seats'][0],
  'pending_cancellation_date' | 'last_activity_at'
>;

export type CopilotSeatEnded = {
  empty?: never;
  org: string;
  user: string;
  team?: string;
  teamJoinedAt?: never;
  teamLeftAt?: string;
  startedAt?: never;
  endedAt?: string;
};

export type CopilotSeatsEmpty = {
  empty: true;
  org: string;
};

export enum GitHubTool {
  Copilot = 'GitHubCopilot',
}

export type CopilotUsageSummary = {
  org: string;
  team: string | null;
} & GetResponseDataTypeFromEndpointMethod<
  typeof octokit.copilot.usageMetricsForOrg
>[0];

export type LanguageEditorBreakdown = CopilotUsageSummary['breakdown'][0];

export type ContributorStats = {
  org: string;
  repo: string;
  user: {
    login: string;
    name?: string;
    email?: string;
    html_url: string;
    type: string;
  };
  total: number;
  weeks: {
    w?: number;
    a?: number;
    d?: number;
    c?: number;
  }[];
};

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
} & Omit<
  GetResponseDataTypeFromEndpointMethod<
    typeof octokit.actions.listWorkflowRunsForRepo
  >['workflow_runs'][0],
  | 'pull_requests'
  | 'actor'
  | 'referenced_workflows'
  | 'triggering_actor'
  | 'head_commit'
  | 'repository'
  | 'head_repository'
>;
