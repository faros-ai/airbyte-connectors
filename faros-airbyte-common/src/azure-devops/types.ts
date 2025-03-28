import {AxiosInstance} from 'axios';
import {IBuildApi} from 'azure-devops-node-api/BuildApi';
import {ICoreApi} from 'azure-devops-node-api/CoreApi';
import {IGitApi} from 'azure-devops-node-api/GitApi';
import {
  Build as BaseBuild,
  BuildArtifact,
  TimelineRecord as BaseTimelineRecord,
} from 'azure-devops-node-api/interfaces/BuildInterfaces';
import {IdentityRef} from 'azure-devops-node-api/interfaces/common/VSSInterfaces';
import * as GitInterfaces from 'azure-devops-node-api/interfaces/GitInterfaces';
import {GraphUser} from 'azure-devops-node-api/interfaces/GraphInterfaces';
import {Pipeline as BasePipeline} from 'azure-devops-node-api/interfaces/PipelinesInterfaces';
import {ProjectReference} from 'azure-devops-node-api/interfaces/ReleaseInterfaces';
import {CodeCoverageStatistics} from 'azure-devops-node-api/interfaces/TestInterfaces';
import {IPipelinesApi} from 'azure-devops-node-api/PipelinesApi';
import {IReleaseApi} from 'azure-devops-node-api/ReleaseApi';
import {ITestApi} from 'azure-devops-node-api/TestApi';
import {IWorkItemTrackingApi} from 'azure-devops-node-api/WorkItemTrackingApi';

export type DevOpsCloud = {
  type: 'cloud';
};
export type DevOpsServer = {
  type: 'server';
  api_url: string;
};
export type AzureDevOpsInstance = DevOpsCloud | DevOpsServer;

export interface AzureDevOpsConfig {
  readonly instance?: AzureDevOpsInstance;
  readonly access_token: string;
  readonly organization: string;
  readonly projects?: ReadonlyArray<string>;
  readonly cutoff_days?: number;
  readonly page_size?: number;
  readonly max_retries?: number;
  readonly request_timeout?: number;
}

export interface AzureDevOpsClient {
  readonly build: IBuildApi;
  readonly core: ICoreApi;
  readonly git: IGitApi;
  readonly wit: IWorkItemTrackingApi;
  readonly pipelines: IPipelinesApi;
  readonly release: IReleaseApi;
  readonly test: ITestApi;
  readonly graph?: AxiosInstance;
}

export type User = GraphUser | IdentityRef;

export interface GraphUserResponse {
  count: number;
  value: GraphUser[];
}

export interface Pipeline extends BasePipeline {
  project: ProjectReference;
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

export interface TimelineRecord
  extends Omit<BaseTimelineRecord, 'result' | 'state'> {
  result: string;
  state: string;
}

export interface Tag extends GitInterfaces.GitRef {
  commit?: GitInterfaces.GitAnnotatedTag;
}

export interface Repository extends GitInterfaces.GitRepository {
  branches?: GitInterfaces.GitBranchStats[];
  tags?: Tag[];
}

export interface PullRequest
  extends Omit<GitInterfaces.GitPullRequest, 'status' | 'mergeStatus'> {
  status: string;
  mergeStatus: string;
  threads: GitInterfaces.GitPullRequestCommentThread[];
}

export interface Commit extends GitInterfaces.GitCommitRef {
  repository?: Repository;
  branch?: string;
}
