export interface Component {
  created_at: string;
  description: string | null;
  group: boolean;
  group_id: string | null;
  id: string;
  name: string;
  only_show_if_degraded: boolean;
  page_id: string;
  position: number;
  showcase: boolean;
  start_date: string | null;
  status: string;
  updated_at: string;
}

export interface ComponentGroup {
  id: string;
  page_id: string;
  name: string;
  description: string;
  components: ReadonlyArray<string>;
  position: string;
  created_at: string;
  updated_at: string;
}

export interface ComponentUptime {
  readonly id: string;
  readonly name: string;
  readonly range_start: string; // date-time
  readonly range_end: string; // date-time
  readonly uptime_percentage: number;
  readonly major_outage: number;
  readonly partial_outage: number;
  readonly warnings: ReadonlyArray<string>;
  readonly related_events: ReadonlyArray<{id: string}>;
  readonly page_id: string;
  readonly group_id?: string;
}

export declare enum IncidentImpact {
  Critical = 'critical',
  Major = 'major',
  Minor = 'minor',
  None = 'none',
}

export declare enum IncidentStatus {
  Identified = 'identified',
  Investigating = 'investigating',
  Monitoring = 'monitoring',
  Postmortem = 'postmortem',
  Resolved = 'resolved',
}

export interface Incident {
  created_at: string;
  id: string;
  impact: IncidentImpact;
  incident_updates: IncidentUpdate[];
  monitoring_at: string | null;
  name: string;
  page_id: string;
  resolved_at: string | null;
  shortlink: string;
  status: IncidentStatus;
  updated_at: string;
  components: Component[];
  postmortem_body: string;
}

export interface IncidentUpdate {
  body: string;
  created_at: string;
  display_at: string;
  id: string;
  incident_id: string;
  status: IncidentStatus;
  updated_at: string;
}

export interface Status extends Page {
  status: {
    description: string;
    indicator: string;
  };
}

export interface Page {
  readonly id: string;
}

export interface User {
  readonly id: string;
  readonly first_name: string;
  readonly last_name: string;
  readonly updated_at: string; // date-time
  readonly created_at: string; // date-time
  readonly email: string;
  readonly organization_id: string;
}
