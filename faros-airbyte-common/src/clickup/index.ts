export interface Workspace {
  id: string;
  name: string;
  color: string;
  avatar: string;
  members: readonly Member[];
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
  computedProperties: {workspace: {id: string}};
  id: string;
  name: string;
  orderindex: number;
  override_statuses: boolean;
  hidden: boolean;
  space: {id: string; name: string; access: boolean};
  task_count: string;
  lists: readonly any[];
}

export interface List {
  computedProperties: {workspace: {id: string}};
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
  computedProperties: {workspace: {id: string}};
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
  archived: boolean;
  creator: Creator;
  assignees: readonly Creator[];
  watchers: readonly Creator[];
  checklists: readonly Checklist[];
  tags: readonly Tag[];
  parent: string;
  priority: number;
  due_date: string;
  start_date: string;
  points: number;
  time_estimate: number;
  custom_fields: readonly CustomField[];
  dependencies: readonly any[];
  linked_tasks: readonly any[];
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
  items: readonly Item[];
}

interface Item {
  id: string;
  name: string;
  orderindex: number;
  assignee: null;
  resolved: boolean;
  parent: null;
  date_created: string;
  children: readonly any[];
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

export interface Goal {
  id: string;
  name: string;
  team_id: string;
  date_created: string;
  start_date: null;
  due_date: string;
  description: string;
  private: boolean;
  archived: boolean;
  creator: number;
  color: string;
  pretty_id: string;
  multiple_owners: boolean;
  folder_id: null;
  members: readonly any[];
  owners: readonly Owner[];
  key_results: readonly any[];
  percent_completed: number;
  history: readonly any[];
  pretty_url: string;
}

interface Owner {
  id: number;
  username: string;
  initials: string;
  email: string;
  color: string;
  profilePicture: string;
}
