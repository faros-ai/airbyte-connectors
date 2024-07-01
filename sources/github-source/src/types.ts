import {AirbyteConfig} from 'faros-airbyte-cdk';

export interface GitHubConfig extends AirbyteConfig {
  readonly authentication: GitHubAuth;
  readonly url?: string;
  readonly orgs?: ReadonlyArray<string>;
  readonly concurrency_limit?: number;
  readonly reject_unauthorized?: boolean;
  readonly previews?: ReadonlyArray<string>;
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

// Copied from @octokit/graphql/dist-types/types.d.ts
export interface GraphQLErrorResponse<T> {
  request: {[key: string]: any};
  headers: {[key: string]: any};
  response?: {
    data?: T;
    errors?: [
      {
        type: string;
        message: string;
        path?: string[];
        extensions?: {[key: string]: any};
        locations?: {line: number; column: number}[];
      },
    ];
  };
}

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
