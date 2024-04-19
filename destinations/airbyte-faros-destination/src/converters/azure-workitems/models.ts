export interface WorkItemResponse {
  count: number;
  value: WorkItem[];
}

export interface WorkItem1 {
  fields: fields;
  id: string;
  rev: string;
  url: string;
  relations: Relations[];
}

export interface WorkItem {
  item: WorkItem1;
  item2: WorkItem2[];
}

export interface WorkItem2 {
  fields: fields;
  id: string;
  workItemId: string;
  revisedBy: user;
  revisedDate: string;
  rev: string;
  url: string;
}

export interface Relations {
  rel: string;
  url: string;
  attributes: Attribute;
}

export interface Attribute {
  authorizedDate: string;
  id: string;
  resourceCreatedDate: string;
  resourceModifiedDate: string;
  revisedDate: string;
  name: string;
}

export interface System {
  AreaPath: string;
  AssignedTo: user;
  BoardColumn: string;
  ChangedBy: user;
  ChangedDate: ChangedDate;
  CreatedDate: string;

  IterationLevel3: string;
  IterationPath: string;
  PersonId: string;
  Reason: string;
  Rev: string;
  RevisedDate: string;
  State: State;
  TeamProject: string;
  Title: string;
  Watermark: string;
  WorkItemType: string;
  parent: string | null;
  Description: string;
}

export interface ChangedDate {
  oldValue: Date;
  newValue: Date;
}

export interface StatusValue {
  oldValue: string;
  newValue: string;
}

export interface State {
  oldValue: string;
  newValue: string;
}

export interface user {
  displayName: string;
  url: string;
  _links: string;
  id: string;
  imageUrl?: string;
  uniqueName: string;
}

export interface User {
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
