import {AirbyteConfig} from 'faros-airbyte-cdk';

export interface WindsurfConfig extends AirbyteConfig {
  readonly service_key: string;
  readonly base_url?: string;
  readonly cutoff_days?: number;
  readonly page_size?: number;
  readonly api_timeout?: number;
  readonly max_retries?: number;
  readonly start_date?: string;
  readonly end_date?: string;
}
