export interface Project {
  id: number;
  projectKey: string;
  name: string;
  chartEnabled: boolean;
  subtaskingEnabled: boolean;
  projectLeaderCanEditProjectLeader: boolean;
  useWikiTreeView: boolean;
  textFormattingRule: string;
  archived: boolean;
  displayOrder: number;
  useDevAttributes: boolean;
}

interface IssueType {
  id: number;
  projectId: number;
  name: string;
  color: string;
  displayOrder: number;
}

interface Resolution {
  id: number;
  name: string;
}

interface Priority {
  id: number;
  name: string;
}

interface Status {
  id: number;
  projectId: number;
  name: string;
  color: string;
  displayOrder: number;
}

interface NulabAccount {
  nulabId: string;
  name: string;
  uniqueId: string;
}

interface User {
  id: number;
  userId: string;
  name: string;
  roleType: number;
  lang: string;
  mailAddress: string;
  nulabAccount: NulabAccount;
  keyword: string;
}

interface Category {
  id: number;
  name: string;
  displayOrder: number;
}

interface Attachment {
  id: number;
  name: string;
  size: number;
  createdUser: User;
  created: Date;
}

interface Star {
  id: number;
  comment?: string;
  url: string;
  title: string;
  presenter: User;
  created: Date;
}
export interface Issue {
  id: number;
  projectId: number;
  issueKey: string;
  keyId: number;
  issueType: IssueType;
  summary: string;
  description?: string;
  resolution?: Resolution;
  priority?: Priority;
  Status: Status;
  assignee?: User;
  category: [Category];
  versions: [string];
  milestone: [string];
  startDate?: Date;
  dueDate?: Date;
  estimatedHours?: number;
  actualHours?: number;
  parentIssueId?: number;
  createdUser: User;
  created: Date;
  updatedUser: User;
  updated: Date;
  customFields: [string];
  attachments: [Attachment];
  sharedFiles: [any];
  stars: [Star];
}
