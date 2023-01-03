export interface Workspace {
  id: string;
  name: string;
  color: string;
  avatar: string;
  members: Member[];
}

interface Member {
  user: User;
}

interface User {
  id: number;
  username: string;
  email: string;
  color: string;
  profilePicture: string;
  initials: string;
  role: number;
  last_active: string;
  date_joined: string;
  date_invited: string;
}

export interface Space {
  computedProperties: {workspace: {id: string}};
  id: string;
  name: string;
  private: boolean;
  statuses: ReadonlyArray<Status>;
  multiple_assignees: boolean;
  features: Features;
}

interface Features {
  due_dates: DueDates;
  time_tracking: Checklists;
  tags: Checklists;
  time_estimates: Checklists;
  checklists: Checklists;
  custom_fields: Checklists;
  remap_dependencies: Checklists;
  dependency_warning: Checklists;
  portfolios: Checklists;
}

interface Checklists {
  enabled: boolean;
}

interface DueDates {
  enabled: boolean;
  start_date: boolean;
  remap_due_dates: boolean;
  remap_closed_due_date: boolean;
}

export interface Folder {
  id: string;
  name: string;
  orderindex: number;
  override_statuses: boolean;
  hidden: boolean;
  space: {id: string; name: string; access: boolean};
  task_count: string;
  lists: any[];
}

export interface List {
  id: string;
  name: string;
  orderindex: number;
  content: string;
  status: {status: string; color: string; hide_label: boolean};
  priority: {priority: string; color: string};
  assignee: null;
  task_count: null;
  due_date: string;
  start_date: null;
  folder: {id: string; name: string; hidden?: boolean; access: boolean};
  space: {id: string; name: string; access: boolean};
  archived: boolean;
  override_statuses: boolean;
  permission_level: string;
}

interface Status {
  status: string;
  color: string;
  orderindex: number;
  type: string;
}

export interface Task {
  id: string;
  custom_id: null;
  name: string;
  text_content: string;
  description: string;
  status: Status;
  orderindex: string;
  date_created: string;
  date_updated: string;
  date_closed: string;
  creator: Creator;
  assignees: Creator[];
  watchers: Creator[];
  checklists: Checklist[];
  tags: Tag[];
  parent: string;
  priority: number;
  due_date: string;
  start_date: string;
  points: number;
  time_estimate: number;
  custom_fields: CustomField[];
  dependencies: any[];
  linked_tasks: any[];
  team_id: string;
  url: string;
  permission_level: string;
  list: FolderRef;
  project: FolderRef;
  folder: FolderRef;
  space: SpaceRef;
}

interface Creator {
  id: number;
  username: string;
  color: string;
  email: string;
  profilePicture: string;
}

interface Checklist {
  id: string;
  task_id: string;
  name: string;
  date_created: string;
  orderindex: number;
  creator: number;
  resolved: number;
  unresolved: number;
  items: Item[];
}

interface Item {
  id: string;
  name: string;
  orderindex: number;
  assignee: null;
  resolved: boolean;
  parent: null;
  date_created: string;
  children: any[];
}

interface CustomField {
  id: string;
  name: string;
  type: string;
  type_config: Record<string, unknown>;
  date_created: string;
  hide_from_guests: boolean;
  required: boolean;
}

interface FolderRef {
  id: string;
  name: string;
  hidden?: boolean;
  access: boolean;
}

interface SpaceRef {
  id: string;
}

interface Tag {
  name: string;
  tag_fg: string;
  tag_bg: string;
}
