import {GraphqlResponseError} from '@octokit/graphql';
import {AirbyteConfig} from 'faros-airbyte-cdk';

import {RunMode} from './streams/common';

export interface GitHubConfig extends AirbyteConfig {
  readonly authentication: GitHubAuth;
  readonly reject_unauthorized?: boolean;
  readonly url?: string;
  readonly organizations?: ReadonlyArray<string>;
  readonly excluded_organizations?: ReadonlyArray<string>;
  readonly repositories?: ReadonlyArray<string>;
  readonly excluded_repositories?: ReadonlyArray<string>;
  readonly run_mode?: RunMode;
  readonly fetch_teams?: boolean;
  readonly fetch_pull_request_files?: boolean;
  readonly fetch_pull_request_reviews?: boolean;
  readonly cutoff_days?: number;
  readonly bucket_id?: number;
  readonly bucket_total?: number;
  readonly page_size?: number;
  readonly timeout?: number;
  readonly concurrency_limit?: number;
  startDate?: Date;
  reposByOrg?: Map<string, Set<string>>;
  excludedReposByOrg?: Map<string, Set<string>>;
}

type GitHubToken = {
  type: 'token';
  personal_access_token: string;
};

type GitHubApp = {
  type: 'app';
  app_id: number;
  private_key: string;
};

export type GitHubAuth = GitHubToken | GitHubApp;

export type GraphQLErrorResponse<T> = Pick<GraphqlResponseError<T>, 'response'>;

export type AuditLogTeamMember = {
  action: 'team.add_member' | 'team.remove_member';
  created_at: number;
  team: string;
  user: string;
};
