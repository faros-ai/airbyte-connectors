import {AirbyteConfig} from 'faros-airbyte-cdk';

export interface GitHubConfig extends AirbyteConfig {
  readonly authentication: GitHubAuth;
  readonly url?: string;
  readonly orgs?: ReadonlyArray<string>;
  readonly concurrency_limit?: number;
  readonly reject_unauthorized?: boolean;
  readonly previews?: ReadonlyArray<string>;
  readonly api_url?: string;
  readonly api_key?: string;
  readonly graph?: string;
}

type GitHubToken = {
  auth: 'token';
  personal_access_token: string;
};

type PartialGitHubApp = {
  auth: 'app';
  app_id: number;
  private_key: string;
};

type GitHubAppInstallation = PartialGitHubApp & {
  app_cfg: {
    auth: 'installation';
    installation_id: number;
  };
};

type GitHubAppClient = PartialGitHubApp & {
  app_cfg: {
    auth: 'client';
    client_id: string;
    client_secret: string;
  };
};

export type GitHubAuth = GitHubToken | GitHubAppClient | GitHubAppInstallation;
