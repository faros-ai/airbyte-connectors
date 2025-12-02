export interface HarnessNextgenConfig {
  readonly api_url?: string;
  readonly account_id: string;
  readonly api_key: string;
  readonly organization_ids?: string[];
  readonly project_ids?: string[];
  readonly cutoff_days: number;
  readonly deployment_timeout?: number;
  readonly page_size?: number;
}

export interface ExecutionState {
  lastEndedAt: number;
}

export interface Organization {
  identifier: string;
  name: string;
  description?: string;
  tags?: Record<string, string>;
}

export interface Project {
  orgIdentifier: string;
  identifier: string;
  name: string;
  color?: string;
  modules?: string[];
  description?: string;
  tags?: Record<string, string>;
}

export interface Pipeline {
  identifier: string;
  name: string;
  description?: string;
  orgIdentifier: string;
  projectIdentifier: string;
  tags?: Record<string, string>;
  stageCount?: number;
  createdAt?: number;
  lastUpdatedAt?: number;
}

export interface Service {
  identifier: string;
  name: string;
  description?: string;
  orgIdentifier: string;
  projectIdentifier: string;
  tags?: Record<string, string>;
  type?: string;
}

export interface Environment {
  identifier: string;
  name: string;
  description?: string;
  orgIdentifier: string;
  projectIdentifier: string;
  type: string;
  tags?: Record<string, string>;
}

export interface Execution {
  planExecutionId: string;
  pipelineIdentifier: string;
  name: string;
  status: string;
  orgIdentifier: string;
  projectIdentifier: string;
  startTs?: number;
  endTs?: number;
  executionTriggerInfo?: {
    triggerType: string;
    triggeredBy?: {
      identifier?: string;
      extraInfo?: Record<string, string>;
    };
  };
  moduleInfo?: {
    cd?: {
      serviceIdentifiers?: string[];
      envIdentifiers?: string[];
      infrastructureIdentifiers?: string[];
    };
  };
  runSequence?: number;
  successfulStagesCount?: number;
  failedStagesCount?: number;
  runningStagesCount?: number;
  totalStagesCount?: number;
  gitDetails?: {
    branch?: string;
    repoIdentifier?: string;
    repoName?: string;
  };
}

export interface PageInfo {
  totalPages: number;
  totalItems: number;
  pageItemCount: number;
  pageSize: number;
  pageIndex: number;
}

export interface PaginatedResponse<T> {
  status: string;
  data: {
    content: T[];
    pageable?: {
      pageNumber: number;
      pageSize: number;
    };
    totalPages?: number;
    totalElements?: number;
    last?: boolean;
    first?: boolean;
    empty?: boolean;
  };
}

export interface ListResponse<T> {
  status: string;
  data: T[];
}

export interface ExecutionListResponse {
  status: string;
  data: {
    content: Execution[];
    pageIndex: number;
    pageSize: number;
    totalPages: number;
    totalItems: number;
    empty: boolean;
  };
}
