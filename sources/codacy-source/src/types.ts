import {AirbyteConfig} from 'faros-airbyte-cdk';

export interface CodacyConfig extends AirbyteConfig {
  readonly api_token: string;
  readonly organization: string;
  readonly repositories?: ReadonlyArray<string>;
  readonly cutoff_days?: number;
  readonly start_date?: string;
  readonly end_date?: string;
  readonly api_timeout?: number;
  readonly api_max_retries?: number;
  startDate?: Date;
  endDate?: Date;
}

export interface CodacyRepository {
  id: number;
  name: string;
  fullName: string;
  language: string;
  private: boolean;
  updatedAt: string;
  owner: {
    id: number;
    name: string;
  };
}

export interface CodacyIssue {
  id: string;
  file: string;
  line: number;
  message: string;
  patternId: string;
  category: string;
  level: string;
  tool: string;
  commitSha: string;
  repositoryId: number;
  createdAt: string;
  updatedAt: string;
}

export interface CodacyMetrics {
  repositoryId: number;
  commitSha: string;
  coverage?: number;
  complexity?: number;
  duplication?: number;
  issues: number;
  fileCount: number;
  lineCount: number;
  createdAt: string;
}
