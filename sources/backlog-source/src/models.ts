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

interface IssueType extends CommonKey {
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
  uniqueId: string;
}

export interface User extends CommonKey {
  userId: string;
  roleType: number;
  lang: string;
  mailAddress: string;
  nulabAccount: NulabAccount;
  keyword: string;
}

interface Category extends CommonKey {
  displayOrder: number;
}

interface Attachment extends CommonKey {
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

interface ChangeLog {
  field: string;
  newValue?: string;
  originalValue?: string;
  attachmentInfo?: any;
  attributeInfo?: any;
  notificationInfo?: any;
}
export interface Comment {
  id: number;
  content?: string;
  changeLog: ChangeLog[];
  createdUser: User;
  created: Date;
  updated: Date;
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
  startDate?: Date;
  dueDate?: Date;
  estimatedHours?: number;
  actualHours?: number;
  parentIssueId?: number;
  createdUser: User;
  created: Date;
  updatedUser: User;
  updated: Date;
  customFields: string[];
  attachments: Attachment[];
  sharedFiles: any;
  stars: Star[];
  comments: Comment[];
}
