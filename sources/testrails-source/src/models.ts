import {DateTime} from 'luxon';

import {
  TestRailsCase,
  TestRailsResult,
  TestRailsRun,
} from './testrails/testRailsModels';

export interface TimeWindow {
  before?: DateTime;
  after?: DateTime;
}

export interface Case extends TestRailsCase {
  readonly type: string;
  readonly milestone: string;
}

export interface Suite {
  readonly id: number;
  readonly name: string;
  readonly description: string;
  readonly is_master: boolean;
  readonly is_baseline: boolean;
  readonly is_complete: boolean;
}

export interface Run extends TestRailsRun {
  readonly milestone: string;
}

export interface Result extends TestRailsResult {
  readonly case_id: number;
  readonly run_id: number;
  readonly status: string;
}
