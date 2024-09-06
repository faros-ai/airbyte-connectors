export interface AccessToken {
  readonly token: string;
}

export interface UserPassword {
  readonly username: string;
  readonly password: string;
}

export type Authentication = AccessToken | UserPassword;
export interface ZephyrConfig {
  readonly url: string;
  readonly authentication: Authentication;
  readonly projects: ReadonlyArray<string>;
  readonly api_timeout?: number;
  readonly api_page_limit?: number;
  readonly api_max_retries?: number;
}
