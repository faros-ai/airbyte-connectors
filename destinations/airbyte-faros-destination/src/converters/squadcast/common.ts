import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter, parseObjectConfig, StreamContext} from '../converter';

export type ApplicationMapping = Record<
  string,
  {name: string; platform?: string}
>;

interface SquadcastConfig {
  application_mapping?: ApplicationMapping;
}

export enum IncidentEventTypeCategory {
  Created = 'Created',
  Acknowledged = 'Acknowledged',
  Resolved = 'Resolved',
  Custom = 'Custom',
}

export enum IncidentStatusCategory {
  Identified = 'Identified',
  Investigating = 'Investigating',
  Monitoring = 'Monitoring',
  Resolved = 'Resolved',
  Custom = 'Custom',
}

export interface IncidentPriority {
  category: IncidentPriorityCategory;
  detail: string;
}

export enum IncidentPriorityCategory {
  Critical = 'Critical',
  High = 'High',
  Medium = 'Medium',
  Low = 'Low',
  Custom = 'Custom',
}

export enum IncidentSeverityCategory {
  Sev1 = 'Sev1',
  Sev2 = 'Sev2',
  Sev3 = 'Sev3',
  Sev4 = 'Sev4',
  Sev5 = 'Sev5',
  Custom = 'Custom',
}

export interface IncidentSeverity {
  category: IncidentSeverityCategory;
  detail: string;
}

interface Assignee {
  id: string;
  type: string;
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

export interface Incident {
  id: string;
  title: string;
  description: string;
  status: string;
  service: string;
  alert_source: string;
  assignee: string;
  created_at: string;
  acknowledged_at: string;
  resolved_at: string;
  tags: Tags;
  event_count: number;
  'tta (ms)': number;
  'ttr (ms)': number;
  logs: Log[];
  url: string;
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

export class SquadcastCommon {
  // Max length for free-form description text fields such as issue body
  static readonly MAX_DESCRIPTION_LENGTH = 1000;
}

/** SquadCast converter base */
export abstract class SquadcastConverter extends Converter {
  source = 'SquadCast';

  /** Almost every SquadCast record have id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }

  protected squadcastConfig(ctx: StreamContext): SquadcastConfig {
    return ctx.config.source_specific_configs?.squadcast ?? {};
  }

  protected applicationMapping(ctx: StreamContext): ApplicationMapping {
    return (
      parseObjectConfig(
        this.squadcastConfig(ctx)?.application_mapping,
        'Application Mapping'
      ) ?? {}
    );
  }
}
