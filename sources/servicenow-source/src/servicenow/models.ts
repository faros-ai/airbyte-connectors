export interface Incident {
  readonly number: {
    readonly value: string;
  };
  readonly short_description: {
    readonly value: string;
  };
  readonly severity: {
    readonly value: string;
  };
  readonly priority: {
    readonly value: string;
  };
  readonly state: {
    readonly displayValue: string;
  };
  readonly assigned_to: {
    readonly value: string;
  };
  readonly opened_by: {
    readonly value: string;
  };
  readonly resolved_at: {
    readonly value: string;
  };
  readonly opened_at: {
    readonly value: string;
  };
  readonly closed_at: {
    readonly value: string;
  };
  readonly sys_updated_on: {
    readonly value: Date;
  };
  readonly cmdb_ci: {
    readonly displayValue: string;
  };
}

export interface User {
  readonly name: {
    readonly value: string;
  };
  readonly sys_id: {
    readonly value: string;
  };
  readonly email: {
    readonly value: string;
  };
  readonly sys_updated_on: {
    readonly value: Date;
  };
}

export interface Pagination {
  readonly pageSize: number;
  readonly offset: number;
}
