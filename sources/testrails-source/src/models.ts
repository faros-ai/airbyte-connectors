import {DateTime} from 'luxon';

import {
  TestRailsCase,
  TestRailsResult,
  TestRailsRun,
} from './testrails/testrails-models';

export interface TimeWindow {
  before?: DateTime;
  after: DateTime;
}

export interface Case extends TestRailsCase {
  readonly project_id: string;
  readonly type: string;
  readonly milestone: string;
}

export interface Suite {
  readonly id: number;
  readonly project_id: string;
  readonly name: string;
  readonly description: string;
  readonly is_master: boolean;
  readonly is_baseline: boolean;
  readonly is_complete: boolean;
}

export interface Run extends TestRailsRun {
  readonly project_id: string;
  readonly milestone: string;
}

export interface Result extends TestRailsResult {
  readonly project_id: string;
  readonly suite_id: number;
  readonly case_id: number;
  readonly run_id: number;
  readonly status: string;
}
