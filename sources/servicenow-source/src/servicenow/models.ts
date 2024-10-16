export interface IncidentRest {
  readonly sys_id: string;
  readonly number: string;
  readonly short_description: string;
  readonly severity: string;
  readonly priority: string;
  readonly state: string;
  readonly assigned_to: any;
  readonly opened_by: any;
  readonly resolved_at: string;
  readonly opened_at: string;
  readonly closed_at: string;
  readonly sys_updated_on: string;
  readonly business_service: any;
  readonly cmdb_ci: any;
}

export interface Incident {
  readonly sys_id: string;
  readonly number: string;
  readonly short_description: string;
  readonly severity: string;
  readonly priority: string;
  readonly state: string;
  readonly assigned_to: string;
  readonly opened_by: string;
  readonly resolved_at: string;
  readonly opened_at: string;
  readonly closed_at: string;
  readonly sys_updated_on: string;
  readonly business_service: string;
  readonly cmdb_ci: string;
}

export interface User {
  readonly name: string;
  readonly sys_id: string;
  readonly email: string;
  readonly sys_updated_on: string;
}

export interface Pagination {
  readonly pageSize: number;
  readonly offset: number;
}
