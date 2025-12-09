// Re-export shared types from faros-airbyte-common
export {
  CDModuleInfo,
  ExecutionOutlineResponse,
  ExecutionStatus,
  ExecutionSummaryResponse,
  ExecutionTriggerInfo,
  ExecutorInfo,
  ModuleInfo,
  Organization,
  OrganizationListResponse,
  Pipeline,
  PipelineExecution,
  PipelineListResponse,
  Project,
  ProjectListResponse,
} from 'faros-airbyte-common/harness';

// Source-specific types
export interface HarnessConfig {
  readonly api_url?: string;
  readonly account_id: string;
  readonly api_key: string;
  readonly organizations?: string[];
  readonly cutoff_days: number;
  readonly page_size?: number;
}
