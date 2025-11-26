import {AxiosInstance} from 'axios';
import {IBuildApi} from 'azure-devops-node-api/BuildApi';
import {ICoreApi} from 'azure-devops-node-api/CoreApi';
import {TeamProject} from 'azure-devops-node-api/interfaces/CoreInterfaces';
import {IGitApi} from 'azure-devops-node-api/GitApi';
import {
  BuildArtifact,
  BuildRepository,
  TimelineRecord as BaseTimelineRecord,
} from 'azure-devops-node-api/interfaces/BuildInterfaces';
import {IdentityRef, ResourceRef} from 'azure-devops-node-api/interfaces/common/VSSInterfaces';
import * as GitInterfaces from 'azure-devops-node-api/interfaces/GitInterfaces';
import {GraphUser} from 'azure-devops-node-api/interfaces/GraphInterfaces';
import {
  Pipeline as BasePipeline,
  Run as BaseRun,
} from 'azure-devops-node-api/interfaces/PipelinesInterfaces';
import {ProjectReference} from 'azure-devops-node-api/interfaces/ReleaseInterfaces';
import {CodeCoverageStatistics} from 'azure-devops-node-api/interfaces/TestInterfaces';
import {TfvcChangeset} from 'azure-devops-node-api/interfaces/TfvcInterfaces';
import {
  Comment,
  WorkItem,
} from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';
import {IPipelinesApi} from 'azure-devops-node-api/PipelinesApi';
import {IReleaseApi} from 'azure-devops-node-api/ReleaseApi';
import {ITestApi} from 'azure-devops-node-api/TestApi';
import {ITfvcApi} from 'azure-devops-node-api/TfvcApi';
import {IWorkItemTrackingApi} from 'azure-devops-node-api/WorkItemTrackingApi';

import {RoundRobinConfig} from '../common/bucketing';

export type DevOpsCloud = {
  type: 'cloud';
};
export type DevOpsServer = {
  type: 'server';
  api_url: string;
};
export type AzureDevOpsInstance = DevOpsCloud | DevOpsServer;

export interface AzureDevOpsConfig extends RoundRobinConfig {
  readonly instance?: AzureDevOpsInstance;
  readonly access_token: string;
  readonly organization: string;
  readonly projects?: ReadonlyArray<string>;
  readonly cutoff_days?: number;
  readonly page_size?: number;
  readonly max_retries?: number;
  readonly request_timeout?: number;
  readonly fetch_work_item_comments?: boolean;
}

export interface AzureDevOpsClient {
  readonly build: IBuildApi;
  readonly core: ICoreApi;
  readonly git: IGitApi;
  readonly tfvc: ITfvcApi;
  readonly wit: IWorkItemTrackingApi;
  readonly pipelines: IPipelinesApi;
  readonly release: IReleaseApi;
  readonly test: ITestApi;
  readonly rest: AxiosInstance;
  readonly graph: AxiosInstance;
}

export type User = GraphUser | IdentityRef;

export interface GraphUserResponse {
  count: number;
  value: GraphUser[];
}

export interface Pipeline extends BasePipeline {
  project: ProjectReference;
}

// Ensure enums are strings
export interface Run extends Omit<BaseRun, 'result' | 'state'> {
  project: ProjectReference;
  result: string;
  state: string;

  // Enherited from Build interface
  artifacts: BuildArtifact[];
  coverageStats: CodeCoverageStatistics[];
  stages: TimelineRecord[];
  startTime?: Date;
  repository: BuildRepository;
  reason: string;
  sourceBranch?: string;
  sourceVersion: string;
  tags: string[];
  triggerInfo?: {
    [key: string]: string;
  };
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
  workItems?: ResourceRef[];
}

export interface Commit extends GitInterfaces.GitCommitRef {
  repository?: Repository;
  branch?: string;
}

export interface WorkItemState {
  name: string;
  category: string;
}

export interface WorkItemStateRevision {
  readonly state: WorkItemState;
  readonly changedDate: string;
}

export interface WorkItemAssigneeRevision {
  readonly assignee: IdentityRef;
  readonly assignedAt: string;
  readonly unassignedAt?: string;
}

export interface WorkItemIterationRevision {
  readonly iteration: number;
  readonly addedAt: string;
  readonly removedAt?: string;
}

export interface WorkItemRevisions {
  readonly states: ReadonlyArray<WorkItemStateRevision>;
  readonly assignees: ReadonlyArray<WorkItemAssigneeRevision>;
  readonly iterations: ReadonlyArray<WorkItemIterationRevision>;
}

export interface WorkItemWithRevisions extends WorkItem {
  revisions: WorkItemRevisions;
  additionalFields: ReadonlyArray<AdditionalField>;
  project: ProjectReference;
  comments?: ReadonlyArray<Comment>;
}

export interface AdditionalField {
  name: string;
  value: string;
}

// Enriched TFVC Changeset with project context
export interface Changeset extends TfvcChangeset {
  project?: ProjectReference;
  organization?: string;
  branch?: string;
}

// TFVC Project with organization context
export interface TfvcProject extends TeamProject {
  organization: string;
}
