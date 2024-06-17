export interface GithubConfig {
  authentication: GitHubAuth;
  api_url?: string;
  concurrency_limit?: number;
  reject_unauthorized?: boolean;
  previews?: ReadonlyArray<string>;
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
  app_auth: {
    auth: 'installation';
    installation_id: number;
  };
};

type GitHubAppClient = PartialGitHubApp & {
  app_auth: {
    auth: 'client';
    client_id: string;
    client_secret: string;
  };
};

export type GitHubAuth = GitHubToken | GitHubAppClient | GitHubAppInstallation;
