export interface AuthorizationResponse {
  data: {
    access_token: string;
    expires_at: number;
    issued_at: number;
    refresh_token: string;
    type: string;
  };
}

export interface Incident {
  id: string;
  service_id: string;
  alert_source_id: string;
  organization_id: string;
  incidentNumber: number;
  message: string;
  assignedTo: IncidentAssignee[];
  description: string;
  status: string;
  timeOfCreation: string;
  tags: Tags;
  logs: Log[];
  analytics: Record<string, Analytic>;
  pinned_messages: any | null;
  deleted: boolean;
  relevantUsers: any[];
  relevantEscalationPolicies: any[];
  relevantSquads: any[];
  relevantSchedules: any[];
  relevantPeopleLogs: any[];
  responseNotes: any[];
}

export interface IncidentResponse {
  data: Incident;
}

export interface Event {
  incident_id: string;
  alert_source_id: string;
  message: string;
  description: string;
  time_of_creation: string;
  tags: Tags;
  deduplication_reason?: {
    matched_event_id: string;
    evaluated_expression: string;
    time_window: number;
  };
  payload: {
    description: string;
    event_id?: string;
    message: string;
    metric?: {
      absolute: {
        current_value: number;
        threshold: number;
        unit: string;
      };
      pod: string;
      relative: {
        current_value: number;
        threshold: number;
      };
      time: string;
    };
    status?: string;
    assignee?: {
      id: string;
      type: string;
    };
    created_by?: string;
    tags?: Tags;
  };
}

export interface EventListResponse {
  data: {
    events: Event[];
  };
  meta: Meta;
}

export interface Service {
  id: string;
  name: string;
  slug: string;
  email: string;
  escalation_policy_id: string;
  organization_id: string;
  api_key: string;
  description: string;
  depends: any[] | null;
  owner?: Assignee;
  access_control: any | null;
  on_maintenance: boolean;
  escalation_policy: {
    id: string;
    name: string;
    description: string;
    slug: string;
  };
}

export interface ServiceResponse {
  data: Service[];
}

export interface Meta {
  total: number;
  count: number;
  current: string;
  next?: string;
}

export interface User {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  contact: {
    dial_code: string;
    phone_number: string;
  };
  secondary_emails: string[];
  email_verified: boolean;
  phone_verified: boolean;
  in_grace_period: boolean;
  time_zone: string;
  title: string;
  bio: string;
  role_id: string;
  role: string;
}

export interface UserResponse {
  data: User[];
}

interface Analytic {
  time: number;
  userId: string;
  escalationPolicyId: string;
  squadId: string;
}

interface Assignee {
  id: string;
  type: string;
}

interface IncidentAssignee extends Assignee {
  timeOfAssignment: string;
}

interface Log {
  action: string;
  assignedTo: string;
  id: string;
  time: string;
  reason: string;
  additionalInfo: any | null;
}

type Tags = Record<string, Tag> | null;
interface Tag {
  value: string;
  color: string;
}
