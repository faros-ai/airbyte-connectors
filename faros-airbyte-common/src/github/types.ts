import {Octokit} from '@octokit/rest';
import {GetResponseDataTypeFromEndpointMethod} from '@octokit/types';

import {
  CommitsQuery,
  LabelsQuery,
  ListMembersQuery,
  PullRequestsQuery,
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
>;

export type PullRequestNode =
  PullRequestsQuery['repository']['pullRequests']['nodes'][0];

export type PullRequest = {
  org: string;
  repo: string;
} & Omit<PullRequestNode, 'labels' | 'files' | 'reviews'> & {
    labels: PullRequestNode['labels']['nodes'];
    files: PullRequestNode['files']['nodes'];
    reviews: PullRequestNode['reviews']['nodes'];
  };

export type PullRequestLabel = PullRequestNode['labels']['nodes'][0];

export type PullRequestFile = PullRequestNode['files']['nodes'][0];

export type PullRequestComment = {
  repository: string;
  user: {login: string};
} & Pick<
  GetResponseDataTypeFromEndpointMethod<
    typeof octokit.pulls.listReviewCommentsForRepo
  >[0],
  'id' | 'body' | 'created_at' | 'updated_at' | 'pull_request_url'
>;

export type PullRequestReview = PullRequestNode['reviews']['nodes'][0];

export type Label = {
  org: string;
  repo: string;
} & LabelsQuery['repository']['labels']['nodes'][0];

type CommitsQueryCommitNode = NonNullable<
  CommitsQuery['repository']['ref']['target'] & {__typename: 'Commit'}
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
} & GetResponseDataTypeFromEndpointMethod<
  typeof octokit.copilot.usageMetricsForOrg
>[0];

export type LanguageEditorBreakdown = CopilotUsageSummary['breakdown'][0];
