import {AirbyteConfig} from 'faros-airbyte-cdk';

export interface BitbucketServerConfig extends AirbyteConfig {
  readonly serverUrl?: string;
  readonly username?: string;
  readonly password?: string;
  readonly token?: string;
  readonly projects: ReadonlyArray<string>;
  readonly repositories?: ReadonlyArray<string>;
  readonly pagelen?: number;
  readonly cutoff_days: number;
}
