import {AirbyteConfig} from 'faros-airbyte-cdk';

export interface GerritBasicAuth {
  type: 'basic';
  username: string;
  password: string;
}

export interface GerritDigestAuth {
  type: 'digest';
  username: string;
  password: string;
}

export type GerritAuthentication = GerritBasicAuth | GerritDigestAuth;

export interface GerritConfig extends AirbyteConfig {
  readonly server_url: string;
  readonly authentication: GerritAuthentication;
  readonly projects?: ReadonlyArray<string>;
  readonly excluded_projects?: ReadonlyArray<string>;
  readonly reject_unauthorized?: boolean;
  readonly page_size?: number;
  readonly cutoff_days?: number;
  readonly start_date?: string;
  readonly end_date?: string;
  readonly concurrency_limit?: number;
  readonly timeout?: number;
  // Calculated from start_date, end_date, and cutoff_days
  startDate?: Date;
  endDate?: Date;
}

export interface StreamState {
  lastUpdated?: string;
}

export interface ChangesStreamState extends StreamState {
  project?: string;
}

export interface ProjectsStreamState extends StreamState {
  lastProject?: string;
}