export interface PagedResponse {
  readonly offset: number;
  readonly limit: number;
  readonly size: number;
  readonly _links: {
    readonly next: string;
    readonly prev: string;
  };
}

export interface Project {
  readonly id: number;
  readonly name: string;
  readonly announcement: string;
  readonly show_announcement: boolean;
  readonly is_completed: boolean;
  readonly completed_on: number;
  readonly suite_mode: number; // 1 for single suite mode, 2 for single suite + baselines, 3 for multiple suites
  readonly default_role_id: number;
  readonly url: string;
  readonly users: any[];
  readonly groups: any[];
}

export interface PagedProjects extends PagedResponse {
  projects: Project[];
}

export interface Suite {
  readonly id: number;
  readonly name: string;
  readonly description: string;
  readonly url: string;
  readonly project_id: number;
  readonly is_master: boolean;
  readonly is_baseline: boolean;
  readonly is_completed: boolean;
  readonly completed_on: number;
}

export interface Case {
  readonly id: number;
  readonly title: string;
  readonly section_id: number;
  readonly template_id: number;
  readonly type_id: number;
  readonly priority_id: number;
  readonly milestone_id: number;
  readonly refs: string;
  readonly created_by: number;
  readonly created_on: number;
  readonly updated_by: number;
  readonly updated_on: number;
  readonly estimate: string; // timespan e.g. “30s” or “1m 45s”
  readonly estimate_forecast: string; // timespan e.g. “30s” or “1m 45s”
  readonly suite_id: number;
  readonly custom_preconds: string;
  readonly custom_steps: string;
  readonly custom_expected: string;
  readonly custom_automation_type?: number;
  readonly custom_update_automation?: boolean;
  readonly custom_notes?: string;
}

export interface PagedCases extends PagedResponse {
  cases: Case[];
}

export interface CaseType {
  readonly id: number;
  readonly name: string;
  readonly is_default: boolean;
}

export interface Run {
  readonly id: number;
}

export interface PagedRuns extends PagedResponse {
  runs: Run[];
}
