export interface PagedResponse {
  readonly offset: number;
  readonly limit: number;
  readonly size: number;
  readonly _links: {
    readonly next: string;
    readonly prev: string;
  };
}

export interface TestRailsProject {
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
  readonly projects: TestRailsProject[];
}

export interface TestRailsSuite {
  readonly id: number;
  readonly name: string;
  readonly description: string;
  readonly url: string;
  readonly project_id: number;
  readonly is_master: boolean;
  readonly is_baseline: boolean;
  readonly is_complete: boolean;
  readonly completed_on: number;
}

export interface PagedSuites extends PagedResponse {
  readonly suites: TestRailsSuite[];
}

export interface TestRailsCase {
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
  readonly cases: TestRailsCase[];
}

export interface TestRailsCaseType {
  readonly id: number;
  readonly name: string;
  readonly is_default: boolean;
}

export interface PagedRuns extends PagedResponse {
  readonly runs: TestRailsRun[];
}

export interface TestRailsMilestone {
  readonly id: number;
  readonly name: string;
  readonly project_id: number;
  readonly is_completed: boolean;
  readonly completed_on: number;
  readonly description: string;
  readonly due_on: number;
  readonly refs: string;
  readonly url: string;
}

export interface TestRailsRun {
  readonly id: number;
  readonly name: string;
  readonly description: string;
  readonly suite_id: number;
  readonly passed_count: number;
  readonly failed_count: number;
  readonly blocked_count: number;
  readonly retest_count: number;
  readonly untested_count: number;
  readonly created_on: number;
  readonly completed_on: number;
  readonly included_all: boolean;
  readonly plan_id: number;
  readonly milestone_id: number;
  readonly config: string;
  readonly config_ids: number[];
  readonly refs: string;
  readonly custom_status1_count: number;
  readonly custom_status2_count: number;
  readonly custom_status3_count: number;
  readonly custom_status4_count: number;
  readonly custom_status5_count: number;
  readonly custom_status6_count: number;
  readonly custom_status7_count: number;
}

export interface TestRailsTest {
  readonly id: number;
  readonly case_id: number;
}

export interface PagedTests extends PagedResponse {
  readonly tests: TestRailsTest[];
}

export interface TestRailsResult {
  readonly id: number;
  readonly test_id: number;
  readonly comment: string;
  readonly version: string;
  readonly defects: string;
  readonly status_id: number;
  readonly created_on: number;
  readonly elapsed: string;
}

export interface PagedResults extends PagedResponse {
  readonly results: TestRailsResult[];
}

export interface TestRailsStatus {
  readonly id: number;
  readonly label: string;
  readonly name: string;
}
