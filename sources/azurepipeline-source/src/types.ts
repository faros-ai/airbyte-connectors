import {
  Build as BaseBuild,
  BuildArtifact,
  TimelineRecord as BaseTimelineRecord,
} from 'azure-devops-node-api/interfaces/BuildInterfaces';
import {Pipeline as BasePipeline} from 'azure-devops-node-api/interfaces/PipelinesInterfaces';
import {CodeCoverageStatistics} from 'azure-devops-node-api/interfaces/TestInterfaces';
import {AzureDevOpsConfig} from 'faros-airbyte-common/azure-devops';

export interface AzurePipelineConfig extends AzureDevOpsConfig {}

export interface Pipeline extends BasePipeline {
  projectName: string;
}
// Ensure Build reason, status, and result enums are strings
export interface Build extends Omit<BaseBuild, 'reason' | 'status' | 'result'> {
  artifacts: BuildArtifact[];
  coverageStats: CodeCoverageStatistics[];
  jobs: TimelineRecord[];
  reason: string;
  status: string;
  result: string;
}

export interface TimelineRecord extends Omit<BaseTimelineRecord, 'result'> {
  result: string;
}
