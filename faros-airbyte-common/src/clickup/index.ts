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
  statuses: ReadonlyArray<{
    status: string;
    type: string;
    orderindex: number;
    color: string;
  }>;
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
