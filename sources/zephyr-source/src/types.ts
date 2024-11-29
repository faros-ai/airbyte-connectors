export interface AccessToken {
  readonly authentication_type: 'Access Token';
  readonly token: string;
}

export interface UserPassword {
  readonly authentication_type: 'Username and Password';
  readonly username: string;
  readonly password: string;
}

export type Authentication = AccessToken | UserPassword;
export type Project<T = any> = T[];
export interface ZephyrConfig {
  readonly url: string;
  readonly authentication: Authentication;
  readonly projects: ReadonlyArray<Project>;
  readonly api_timeout?: number;
  readonly api_page_limit?: number;
  readonly api_max_retries?: number;
}
