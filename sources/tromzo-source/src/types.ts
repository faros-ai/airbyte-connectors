import {AirbyteConfig} from 'faros-airbyte-cdk';

export interface TromzoConfig extends AirbyteConfig {
  readonly api_key: string;
  readonly organization: string;
  readonly tools: ReadonlyArray<string>;
  readonly cutoff_days?: number;
  readonly start_date?: string;
  readonly end_date?: string;
  readonly api_timeout?: number;
  readonly api_page_size?: number;
  readonly api_max_retries?: number;
  // startDate and endDate are calculated from start_date, end_date, and cutoff_days
  startDate?: Date;
  endDate?: Date;
}

export interface Finding {
  toolName?: string;
  dbUpdatedAt?: string;
  scannerCreatedAt?: string;
  dueDate?: string;
  dismissReason?: string;
  dismissedAt?: string;
  scannerDismissedAt?: string;
  sourceFilename?: string;
  sourcePath?: string;
  vulnerableVersion?: string;
  vulnerability?: {
    severity?: string;
    cve?: string;
    ghsa?: string;
    score?: number;
    fixAvailable?: boolean;
  };
  status?: string;
  scannerStatus?: string;
  line?: number;
  asset?: {
    name?: string;
    id?: string;
    type?: string;
    description?: string;
    service?: string;
  };
  projects?: any;
  key?: string;
}
