import {IdentityRef} from 'azure-devops-node-api/interfaces/common/VSSInterfaces';
import {GraphUser} from 'azure-devops-node-api/interfaces/GraphInterfaces';
import {WorkItem} from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';

export type DevOpsCloud = {
  type: 'cloud';
};

export type DevOpsServer = {
  type: 'server';
  api_url: string;
};

export type AzureInstance = DevOpsCloud | DevOpsServer;

export interface AzureWorkitemsConfig {
  readonly instance: AzureInstance;
  readonly access_token: string;
  readonly organization: string;
  readonly project: string;
  readonly projects: string[];
  readonly additional_fields: string[];
  readonly cutoff_days?: number;
  readonly page_size?: number;
  readonly max_retries?: number;
  readonly request_timeout?: number;
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
  readonly assignee: string;
  readonly changedDate: string;
}

export interface WorkItemIterationRevision {
  readonly iteration: string;
  readonly addedAt: string;
  readonly removedAt: string | null;
}

export interface WorkItemRevisions {
  readonly states: ReadonlyArray<WorkItemStateRevision>;
  readonly assignees: ReadonlyArray<WorkItemAssigneeRevision>;
  readonly iterations: ReadonlyArray<WorkItemIterationRevision>;
}

export interface WorkItemWithRevisions extends WorkItem {
  revisions: WorkItemRevisions;
  additionalFields: ReadonlyArray<AdditionalField>;
  projectId: string;
}

export interface AdditionalField {
  name: string;
  value: string;
}

export interface UserResponse {
  count: number;
  value: GraphUser[];
}
export type User = GraphUser | IdentityRef;
