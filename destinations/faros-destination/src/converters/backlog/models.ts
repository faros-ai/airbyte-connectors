interface CommonKey {
  id: number;
  name: string;
}

export interface Project extends CommonKey {
  projectKey: string;
  chartEnabled: boolean;
  subtaskingEnabled: boolean;
  projectLeaderCanEditProjectLeader: boolean;
  useWikiTreeView: boolean;
  textFormattingRule: string;
  archived: boolean;
  displayOrder: number;
  useDevAttributes: boolean;
}

export interface IssueType extends CommonKey {
  projectId: number;
  color: string;
  displayOrder: number;
}

interface Status extends CommonKey {
  projectId: number;
  color: string;
  displayOrder: number;
}

interface NulabAccount {
  nulabId: string;
  name: string;
  uniqueId?: string;
}

export interface User extends CommonKey {
  userId: string;
  roleType: number;
  lang: string;
  mailAddress: string;
  nulabAccount?: NulabAccount;
  keyword: string;
}

interface Category extends CommonKey {
  displayOrder: number;
}

interface Attachment extends CommonKey {
  size: number;
  createdUser: User;
  created: string;
}

interface Star {
  id: number;
  comment?: string;
  url: string;
  title: string;
  presenter: User;
  created: string;
}

interface ChangeLog {
  field: string;
  newValue?: string;
  originalValue?: string;
  attachmentInfo?: CommonKey;
  attributeInfo?: any;
  notificationInfo?: any;
}

export interface customFields {
  name: string;
  value: string;
}

export interface Comment {
  id: number;
  content?: string;
  changeLog: ChangeLog[];
  createdUser: User;
  created: string;
  updated: string;
  stars: Star[];
  notifications: any;
}

export interface Issue {
  id: number;
  projectId: number;
  issueKey: string;
  keyId: number;
  issueType: IssueType;
  summary: string;
  description?: string;
  resolution?: CommonKey;
  priority?: CommonKey;
  status: Status;
  assignee?: User;
  category: Category[];
  versions: string[];
  milestone: string[];
  startDate?: string;
  dueDate?: string;
  estimatedHours?: number;
  actualHours?: number;
  parentIssueId?: number;
  createdUser: User;
  created: string;
  updatedUser: User;
  updated: string;
  customFields: customFields[];
  attachments: Attachment[];
  sharedFiles: any;
  stars: Star[];
  comments: Comment[];
}

export interface TaskType {
  category: string;
  detail?: string;
}

export enum TaskCategory {
  Bug = 'Bug',
  Custom = 'Custom',
  Story = 'Story',
  Task = 'Task',
}

export enum TaskStatusCategory {
  Done = 'Done',
  InProgress = 'InProgress',
  Todo = 'Todo',
}

export interface TaskStatusChange {
  status: string;
  changedAt: Date;
}

export interface TaskField {
  name: string;
  value: string;
}
