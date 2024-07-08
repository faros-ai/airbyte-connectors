import {GraphqlResponseError} from '@octokit/graphql';
import {AirbyteConfig} from 'faros-airbyte-cdk';

import {RunMode} from './streams/common';

export interface GitHubConfig extends AirbyteConfig {
  readonly authentication: GitHubAuth;
  readonly url?: string;
  readonly organizations?: ReadonlyArray<string>;
  readonly fetch_teams?: boolean;
  readonly concurrency_limit?: number;
  readonly reject_unauthorized?: boolean;
  readonly previews?: ReadonlyArray<string>;
  readonly run_mode?: RunMode;
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

export type OrgMembers = {
  organization: {
    membersWithRole: {
      nodes: {
        login: string;
        name?: string;
        email?: string;
        type: string;
        html_url: string;
      }[];
      pageInfo: PageInfo;
    };
  };
};

type PageInfo = {
  endCursor: string;
  hasNextPage: boolean;
};
