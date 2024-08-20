import {AirbyteConfig} from 'faros-airbyte-cdk';

export interface BitbucketConfig extends AirbyteConfig {
  readonly api_url?: string;
  readonly username?: string;
  readonly password?: string;
  readonly token?: string;
  readonly workspaces: ReadonlyArray<string>;
  readonly repositories?: ReadonlyArray<string>;
  readonly page_size?: number;
  readonly cutoff_days?: number;
}
