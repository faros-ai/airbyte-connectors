import {
  Build as BaseBuild,
  BuildArtifact,
  Timeline,
} from 'azure-devops-node-api/interfaces/BuildInterfaces';
import {Pipeline as BasePipeline} from 'azure-devops-node-api/interfaces/PipelinesInterfaces';
import {CodeCoverageStatistics} from 'azure-devops-node-api/interfaces/TestInterfaces';
import {AzureDevOpsConfig} from 'faros-airbyte-common/azure-devops';

export interface AzurePipelineConfig extends AzureDevOpsConfig {}

export interface Pipeline extends BasePipeline {
  projectName: string;
}

export interface Build extends BaseBuild {
  artifacts: BuildArtifact[];
  coverageStats: CodeCoverageStatistics[];
  jobs: Timeline[];
}
