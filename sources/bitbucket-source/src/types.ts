import {AirbyteConfig} from 'faros-airbyte-cdk';

export interface BitbucketConfig extends AirbyteConfig {
  readonly api_url?: string;
  readonly username?: string;
  readonly password?: string;
  readonly token?: string;
  readonly workspaces?: ReadonlyArray<string>;
  readonly excluded_workspaces?: ReadonlyArray<string>;
  readonly repositories?: ReadonlyArray<string>;
  readonly excluded_repositories?: ReadonlyArray<string>;
  readonly page_size?: number;
  readonly bucket_id?: number;
  readonly bucket_total?: number;
  readonly cutoff_days?: number;
  readonly start_date?: string;
  readonly end_date?: string;
  // startDate and endDate are calculated from start_date, end_date, and cutoff_days
  startDate?: Date;
  endDate?: Date;
}
