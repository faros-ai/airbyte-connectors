// Harness NextGen API types

export type ExecutionStatus =
  | 'SUCCESS'
  | 'FAILED'
  | 'RUNNING'
  | 'ABORTED'
  | 'EXPIRED'
  | 'QUEUED'
  | 'PAUSED'
  | 'WAITING'
  | 'APPROVALWAITING'
  | 'ASYNCWAITING'
  | 'TASKWAITING'
  | 'TIMEDWAITING';

export interface ExecutorInfo {
  triggerType: string;
  username?: string;
  email?: string;
}

export interface CDModuleInfo {
  serviceIdentifiers?: string[];
  envIdentifiers?: string[];
  serviceDefinitionTypes?: string[];
  environmentTypes?: string[];
  infrastructureTypes?: string[];
  infrastructureIdentifiers?: string[];
  infrastructureNames?: string[];
  artifactDisplayNames?: string[];
}

export interface ModuleInfo {
  cd?: CDModuleInfo;
}

export interface ExecutionTriggerInfo {
  triggerType: string;
  triggeredBy?: {
    identifier: string;
    extraInfo?: Record<string, string>;
  };
}

// Pipeline execution from NextGen API
export interface PipelineExecution {
  planExecutionId: string;
  pipelineIdentifier: string;
  orgIdentifier: string;
  projectIdentifier: string;
  name: string;
  status: ExecutionStatus;
  startTs: number;
  endTs?: number;
  executorInfo?: ExecutorInfo;
  moduleInfo?: ModuleInfo;
  modules?: string[];
  runSequence?: number;
  successfulStagesCount?: number;
  failedStagesCount?: number;
  runningStagesCount?: number;
  totalStagesCount?: number;
  executionTriggerInfo?: ExecutionTriggerInfo;
}

// Pipeline definition
export interface Pipeline {
  identifier: string;
  orgIdentifier: string;
  projectIdentifier: string;
  name: string;
  description?: string;
  tags?: Record<string, string>;
  storeType?: string;
}

// Organization
export interface Organization {
  identifier: string;
  name: string;
  description?: string;
  tags?: Record<string, string>;
}

// Project
export interface Project {
  identifier: string;
  orgIdentifier: string;
  name: string;
  description?: string;
  tags?: Record<string, string>;
  modules?: string[];
}

// API response types
export interface ExecutionSummaryResponse {
  status: string;
  data: {
    content: PipelineExecution[];
    totalElements?: number;
    totalPages?: number;
    pageNumber?: number;
    pageSize?: number;
    empty?: boolean;
  };
}

export interface ExecutionOutlineResponse {
  status: string;
  data: {
    content: PipelineExecution[];
    currentSize: number;
    lastSeenExecutionId?: string;
    lastSeenStartTime?: number;
    hasMore: boolean;
  };
}

export interface PipelineListResponse {
  status: string;
  data: {
    content: Pipeline[];
    totalElements?: number;
    totalPages?: number;
    pageNumber?: number;
    pageSize?: number;
  };
}

export interface OrganizationListResponse {
  status: string;
  data: {
    content: {organization: Organization}[];
    totalElements?: number;
    totalPages?: number;
    pageNumber?: number;
    pageSize?: number;
  };
}

export interface ProjectListResponse {
  status: string;
  data: {
    content: {project: Project}[];
    totalElements?: number;
    totalPages?: number;
    pageNumber?: number;
    pageSize?: number;
  };
}
