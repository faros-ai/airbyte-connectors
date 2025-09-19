import {GraphqlResponseError} from '@octokit/graphql';
import {AirbyteConfig} from 'faros-airbyte-cdk';
import {RoundRobinConfig} from 'faros-airbyte-common/common';

import {RunMode} from './streams/common';

export interface GitHubConfig extends AirbyteConfig, RoundRobinConfig {
  readonly authentication: GitHubAuth;
  readonly reject_unauthorized?: boolean;
  readonly url?: string;
  readonly use_faros_graph_repos_selection?: boolean;
  readonly organizations?: ReadonlyArray<string>;
  readonly excluded_organizations?: ReadonlyArray<string>;
  readonly repositories?: ReadonlyArray<string>;
  readonly excluded_repositories?: ReadonlyArray<string>;
  readonly enterprises?: ReadonlyArray<string>;
  readonly run_mode?: RunMode;
  readonly custom_streams?: ReadonlyArray<string>;
  readonly fetch_teams?: boolean;
  readonly fetch_pull_request_files?: boolean;
  readonly fetch_pull_request_reviews?: boolean;
  readonly cutoff_days?: number;
  readonly api_url?: string;
  readonly api_key?: string;
  readonly graph?: string;
  readonly page_size?: number;
  readonly commits_page_size?: number;
  readonly pull_requests_page_size?: number;
  readonly timeout?: number;
  readonly concurrency_limit?: number;
  readonly start_date?: string;
  readonly end_date?: string;
  readonly fetch_pull_request_diff_coverage?: boolean;
  readonly pull_request_cutoff_lag_seconds?: number;
  readonly max_deployment_duration_days?: number;
  readonly fetch_public_organizations?: boolean;
  readonly skip_repos_without_recent_push?: boolean;
  readonly copilot_metrics_teams?: ReadonlyArray<string>;
  readonly proxy_url?: string;
  // startDate and endDate are calculated from start_date, end_date, and cutoff_days
  startDate?: Date;
  endDate?: Date;
  reposByOrg?: Map<string, Set<string>>;
  excludedReposByOrg?: Map<string, Set<string>>;
  tmsEnabled?: boolean;
  cicdEnabled?: boolean;
}

type GitHubToken = {
  type: 'token';
  personal_access_token: string;
};

type GitHubApp = {
  type: 'app';
  app_id: number;
  private_key: string;
};

export type GitHubAuth = GitHubToken | GitHubApp;

export type GraphQLErrorResponse<T> = Pick<GraphqlResponseError<T>, 'response'>;

export type CopilotMetricsResponse = {
  date: string;
  total_active_users: number;
  total_engaged_users: number;
  copilot_ide_code_completions: {
    total_engaged_users: number;
    editors: {
      name: string;
      total_engaged_users: number;
      models: {
        name: string;
        is_custom_model: boolean;
        custom_model_training_date: string | null;
        total_engaged_users: number;
        languages: {
          name: string;
          total_engaged_users: number;
          total_code_suggestions: number;
          total_code_acceptances: number;
          total_code_lines_suggested: number;
          total_code_lines_accepted: number;
        }[];
      }[];
    }[];
  } | null;
  copilot_ide_chat: {
    total_engaged_users: number;
    editors: {
      name: string;
      total_engaged_users: number;
      models: {
        name: string;
        is_custom_model: boolean;
        custom_model_training_date: string | null;
        total_engaged_users: number;
        total_chats: number;
        total_chat_insertion_events: number;
        total_chat_copy_events: number;
      }[];
    }[];
  } | null;
  copilot_dotcom_chat: {
    total_engaged_users: number;
    models: {
      name: string;
      is_custom_model: boolean;
      custom_model_training_date: string | null;
      total_engaged_users: number;
      total_chats: number;
    }[];
  } | null;
  copilot_dotcom_pull_requests: {
    total_engaged_users: number;
    repositories: {
      name: string;
      total_engaged_users: number;
      models: {
        name: string;
        is_custom_model: boolean;
        custom_model_training_date: string | null;
        total_pr_summaries_created: number;
        total_engaged_users: number;
      }[];
    }[];
  } | null;
}[];

export type CopilotUserEngagementResponse = {
  date: string;
  blob_uri: string;
}[];

export type CopilotUserUsageResponse = {
  download_links: string[];
  report_start_day: string;
  report_end_day: string;
};
