export interface WorkItemResponse {
  count: number;
  value: WorkItem[];
}

export interface WorkItem {
  _links: {
    html: Href;
  };
  fields: fields;
  id: string;
  rev: string;
  url: string;
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

export interface User {
  id: string;
  subjectKind: string;
  domain: string;
  principalName: string;
  mailAddress: string;
  origin: string;
  originId: string;
  displayName: string;
  url: string;
  descriptor: string;
  _links: UserLink;
  uniqueName: string;
}

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
  value: User[];
}

export interface UserType {
  category: UserTypeCategory;
  detail: string;
}
export enum UserTypeCategory {
  Bot = 'Bot',
  Organization = 'Organization',
  User = 'User',
  Custom = 'Custom',
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
export interface Iteration {
  attributes: {
    startDate: string;
    finishDate: string;
    timeFrame: string;
  };
  id: string;
  name: string;
  path: string;
  url: string;
}
export interface Board {
  id: string;
  name: string;
  url: string;
}

// TODO - Move to common models
export interface CategoryDetail {
  category: string;
  detail: string;
}

export interface TaskKey {
  uid: string;
  source: string;
}

export interface TaskStatusChange {
  status: CategoryDetail;
  changedAt: Date;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  lastUpdateTime: string;
}
