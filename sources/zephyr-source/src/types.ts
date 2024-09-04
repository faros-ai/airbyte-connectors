export interface ZephyrConfig {
  access_token: string;
  projects: ReadonlyArray<string>;
  cutoff_days?: number;
  api_timeout?: number;
  api_page_limit?: number;
  api_max_retries?: number;
}
