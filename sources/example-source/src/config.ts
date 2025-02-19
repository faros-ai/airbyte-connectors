import {AirbyteConfig} from 'faros-airbyte-cdk';

export interface SourceConfig extends AirbyteConfig {
  readonly user: string;
}
