export interface WorkItemResponse1 {
  count: number;
  value: WorkItem1[];
}

export interface WorkItemResponse2 {
  count: number;
  value: WorkItem2[];
}

export interface WorkItem1 {
  fields: any;
  id: string;
  rev: string;
  url: string;
}

export interface WorkItem2 {
  fields: fields;
  id: string;
  workItemId: string;
  revisedBy: string;
  revisedDate: string;
  rev: string;
  url: string;
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
