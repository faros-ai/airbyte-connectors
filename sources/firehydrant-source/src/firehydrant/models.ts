interface ObjectBase {
  id: string;
  name: string;
}

interface IncidentRole extends ObjectBase {
  summary: string;
  description: string;
  created_at: string;
  updated_at: string;
  discarded_at?: any;
  tasks: [any];
}

interface Milestone {
  id: string;
  created_at: string;
  updated_at: string;
  type: string;
  occurred_at: string;
  duration: string;
}

export interface User extends ObjectBase {
  email?: string;
  created_at: string;
  updated_at: string;
  slack_linked?: boolean;
}

interface RoleAssignment {
  id: string;
  status: string;
  created_at: string;
  updated_at: string;
  incident_role: IncidentRole;
  user: User;
  tasks: [any];
}

interface LastNote {
  id: string;
  body: string;
  created_at: string;
}

interface Condition extends ObjectBase {
  position: number;
}

interface Impact {
  id: string;
  type: string;
  impact: ObjectBase;
  condition: Condition;
}

interface CreatedBy extends ObjectBase {
  source: string;
  email: string;
}

export interface IncidentTicket {
  id: string;
  summary: string;
  description?: any;
  state: string;
  type: string;
  assignees: [any];
  created_by: CreatedBy;
  attachments: [any];
}

export interface IncidentEvent {
  id: string;
  incident_id: string;
  occurred_at: string;
  type: string;
  visibility: string;
  author: User;
  data: any;
}

export interface Incident extends ObjectBase {
  created_at: string;
  started_at: string;
  summary: string;
  customer_impact_summary: string;
  description: string;
  current_milestone: string;
  number: number;
  priority: string;
  severity: string;
  severity_impact?: any;
  severity_condition?: any;
  tag_list: [string];
  private_id: string;
  organization_id: string;
  incident_roles: [IncidentRole];
  milestones: [Milestone];
  active: boolean;
  labels: Record<string, string>;
  role_assignments: [RoleAssignment];
  status_pages: [any];
  incident_url: string;
  private_status_page_url: string;
  organization: ObjectBase;
  customers_impacted: number;
  monetary_impact?: any;
  monetary_impact_cents?: any;
  last_update: string;
  last_note: LastNote;
  report_id?: any;
  services: ObjectBase[];
  environments: ObjectBase[];
  functionalities: ObjectBase[];
  channel_name?: any;
  channel_reference?: any;
  channel_id?: any;
  channel_status?: any;
  incident_tickets: [IncidentTicket];
  impacts: [Impact];
  conference_bridges: [any];
  incident_channels: [any];
  retro_s: [any];
  created_by: CreatedBy;
  context_object?: any;
  restricted: boolean;
  explicit_organization_user_ids: [any];
  events: IncidentEvent[];
}

interface TeamMember {
  user: User;
  default_incident_role: IncidentRole;
}

export interface Team extends ObjectBase {
  description?: string;
  slug?: string;
  created_at: string;
  updated_at: string;
  memberships: [TeamMember];
}

export interface PageInfo {
  count: number;
  page: number;
  items: number;
  pages: number;
  last: number;
  prev?: number;
  next?: number;
}

export interface PaginateResponse<T> {
  data: T[];
  pagination: PageInfo;
}
