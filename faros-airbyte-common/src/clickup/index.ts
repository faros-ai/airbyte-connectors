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

export interface Task {
  id: string;
  name: string;
  status: Status;
  orderindex: string;
  date_created: string;
  date_updated: string;
  date_closed: null;
  creator: {
    id: number;
    username: string;
    color: string;
    profilePicture: string;
  };
  assignees: any[];
  checklists: any[];
  tags: any[];
  parent: null;
  priority: null;
  due_date: null;
  start_date: null;
  time_estimate: null;
  time_spent: null;
  list: {id: string};
  folder: {id: string};
  space: {id: string};
  url: string;
}

interface Status {
  status: string;
  color: string;
  orderindex: number;
  type: string;
}
