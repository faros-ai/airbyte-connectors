import {AirbyteConfig} from 'faros-airbyte-cdk';
import {RoundRobinConfig} from 'faros-airbyte-common/common';

/**
 * GitLab authentication types
 */
export interface GitLabTokenAuth {
  type: 'token';
  personal_access_token: string;
}

/**
 * GitLab authentication options
 */
export type GitLabAuth = GitLabTokenAuth;

/**
 * Run modes for the connector
 */
export enum RunMode {
  Minimum = 'Minimum',
  Full = 'Full',
  Custom = 'Custom',
}

/**
 * GitLab source configuration
 */
export interface GitLabConfig extends AirbyteConfig, RoundRobinConfig {
  authentication: GitLabAuth;
  url?: string;
  reject_unauthorized?: boolean;
  groups?: string[];
  excluded_groups?: string[];
  run_mode: RunMode;
  custom_streams?: string[];
  cutoff_days?: number;
  bucket_id?: number;
  bucket_total?: number;
  round_robin_bucket_execution?: boolean;
  bucket_ranges?: string[];
  page_size?: number;
  timeout?: number;
  concurrency_limit?: number;
  backfill?: boolean;
  start_date?: string;
  end_date?: string;
  fetch_public_groups?: boolean;
}
