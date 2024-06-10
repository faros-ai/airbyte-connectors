interface Authentication {
  client_id: string;
  client_secret: string;
}

export interface XrayConfig {
  authentication: Authentication;
  projects: ReadonlyArray<string>;
  cutoff_days?: number;
  api_timeout?: number;
}
