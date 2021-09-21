import {AirbyteConfig} from 'faros-airbyte-cdk/lib';

export interface BitbucketConfig extends AirbyteConfig {
  readonly server_url: string;
  readonly username: string;
  readonly password: string;
  readonly token: string;
  readonly workspace: string;
  readonly repoList?: ReadonlyArray<string>;
}

export interface Repository {
  readonly scm: string;
  readonly website: string;
  readonly hasWiki: boolean;
  readonly uuid: string;
  readonly links: {
    readonly branchesUrl: string;
    readonly htmlUrl: string;
  };
  readonly forkPolicy: string;
  readonly fullName: string;
  readonly name: string;
  readonly project: {
    readonly type: string;
    readonly name: string;
    readonly key: string;
    readonly uuid: string;
    readonly links: {readonly htmlUrl: string};
  };
  readonly language: string;
  readonly createdOn: string;
  readonly mainBranch: {
    readonly type: string;
    readonly name: string;
  };
  readonly workspace: {
    readonly slug: string;
    readonly type: string;
    readonly name: string;
    readonly uuid: string;
    readonly links: {readonly htmlUrl: string};
  };
  readonly hasIssues: boolean;
  readonly owner: {
    readonly username: string;
    readonly displayName: string;
    readonly type: string;
    readonly uuid: string;
    readonly links: {readonly htmlUrl: string};
  };
  readonly updatedOn: string;
  readonly size: number;
  readonly type: string;
  readonly slug: string;
  readonly isPrivate: boolean;
  readonly description: string;
}

export interface Workspace {
  readonly uuid: string;
  readonly createdOn: string;
  readonly type: string;
  readonly slug: string;
  readonly isPrivate: boolean;
  readonly name: string;
  readonly links: {
    readonly ownersUrl: string;
    readonly repositoriesUrl: string;
    readonly htmlUrl: string;
  };
}
