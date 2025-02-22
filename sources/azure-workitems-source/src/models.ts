import {IdentityRef} from 'azure-devops-node-api/interfaces/common/VSSInterfaces';
import {GraphUser} from 'azure-devops-node-api/interfaces/GraphInterfaces';
import {WorkItem} from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';

export interface WorkItemResponse {
  count: number;
  value: WorkItem[];
}

export interface WorkItemUpdatesResponse {
  count: number;
  value: any[];
}

export interface WorkItemWithRevisions extends WorkItem {
  revisions: {
    states: any[];
    assignees: any[];
    iterations: any[];
  };
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
