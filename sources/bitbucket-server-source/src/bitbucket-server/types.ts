import {AirbyteConfig} from 'faros-airbyte-cdk';

export interface BitbucketServerConfig extends AirbyteConfig {
  readonly server_url?: string;
  readonly username?: string;
  readonly password?: string;
  readonly token?: string;
  readonly projects?: ReadonlyArray<string>;
  readonly page_size?: number;
  readonly cutoff_days?: number;
}

export interface WorkspaceUser {
  readonly user: {
    readonly displayName: string;
    readonly type: string;
    readonly nickname: string;
    readonly accountId: string;
    readonly links: {
      readonly htmlUrl: string;
    };
  };
  readonly workspace: {
    readonly slug: string;
  };
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
