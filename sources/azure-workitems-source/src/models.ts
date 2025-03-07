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

export type AzureInstanceType = DevOpsCloud | DevOpsServer;

export interface AzureWorkitemsConfig {
  readonly instance_type: AzureInstanceType;
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

export interface System {
  AreaPath: string;
  AssignedTo: user;
  BoardColumn: string;
  ChangedBy: user;
  ChangedDate: string;
  CreatedDate: string;

  IterationLevel3: string;
  IterationPath: string;
  PersonId: string;
  Reason: string;
  Rev: string;
  RevisedDate: string;
  State: string;
  TeamProject: string;
  Title: string;
  Watermark: string;
  WorkItemType: string;
  parent: string | null;
  Description: string;
}

export interface user {
  displayName: string;
  url: string;
  _links: string;
  id: string;
  uniqueName: string;
}

// export interface User {
//   id: string;
//   subjectKind: string;
//   domain: string;
//   principalName: string;
//   mailAddress: string;
//   origin: string;
//   originId: string;
//   displayName: string;
//   url: string;
//   descriptor: string;
//   uniqueName: string;
//   _links: UserLink;
// }

export type User = GraphUser | IdentityRef;
interface UserLink {
  self: Href;
  memberships: Href;
  membershipState: Href;
  storageKey: Href;
  avatar: Href;
}
interface Href {
  href: string;
}

export interface UserResponse {
  count: number;
  value: GraphUser[];
}

export interface fields {
  Microsoft: {
    VSTS: {
      Common: {
        Priority: string;
        StateChangeDate: string;
        ValueArea: string;
      };
    };
  };
  System: System;
  Faros: {
    WorkItemStateCategory: any;
  };
}

export interface Board {
  id: string;
  name: string;
  url: string;
}
