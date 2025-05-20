import {AirbyteConfig} from 'faros-airbyte-cdk';
import {RoundRobinConfig} from 'faros-airbyte-common/common';

import {RunMode} from './streams/common';

export interface GitLabConfig extends AirbyteConfig, RoundRobinConfig {
  readonly authentication: GitLabToken;
  readonly reject_unauthorized?: boolean;
  readonly url?: string;
  readonly groups?: ReadonlyArray<string>;
  readonly excluded_groups?: ReadonlyArray<string>;
  readonly run_mode?: RunMode;
  readonly custom_streams?: ReadonlyArray<string>;
  readonly cutoff_days?: number;
  readonly page_size?: number;
  readonly timeout?: number;
  readonly concurrency_limit?: number;
  readonly start_date?: string;
  readonly end_date?: string;
  readonly fetch_public_groups?: boolean;
  // startDate and endDate are calculated from start_date, end_date, and cutoff_days
  startDate?: Date;
  endDate?: Date;
}

export type GitLabToken = {
  type: 'token';
  personal_access_token: string;
};

export interface Group {
  id: string;
  name: string;
  path: string;
  web_url: string;
  description: string | null;
  visibility: string;
  created_at: string;
  updated_at: string;
}
