import {AirbyteConfig} from 'faros-airbyte-cdk/lib';

export interface BitbucketConfig extends AirbyteConfig {
  readonly server_url: string;
  readonly username: string;
  readonly password: string;
  readonly token: string;
  readonly workspace: string;
  readonly repoList: string;
}

export interface Branch {
  readonly name: string;
  readonly links: {readonly htmlUrl: string};
  readonly defaultMergeStrategy: string;
  readonly mergeStrategies: string[];
  readonly type: string;
  readonly target: {
    readonly hash: string;
    readonly repository: {
      readonly links: {readonly htmlUrl: string};
      readonly type: string;
      readonly name: string;
      readonly fullName: string;
      readonly uuid: string;
    };
    readonly links: {readonly htmlUrl: string};
    readonly author: {
      readonly raw: string;
      readonly type: string;
      readonly user: {
        readonly displayName: string;
        readonly uuid: string;
        readonly links: {readonly htmlUrl: string};
        readonly type: string;
        readonly nickname: string;
        readonly accountId: string;
      };
    };
    readonly parent: {
      readonly hash: string;
      readonly links: {readonly htmlUrl: string};
    }[];
    readonly date: string;
    readonly message: string;
    readonly type: string;
  };
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
