import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter} from '../converter';

/** TestRails converter base */
export abstract class TestRailsConverter extends Converter {
  source = 'TestRails';
  /** Almost every TestRails record has id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }

  convertType(type: string): {category: string; detail: string} {
    switch (type) {
      case 'Compatibility':
        return {category: 'Integration', detail: type};
      case 'Functional':
        return {category: 'Functional', detail: type};
      case 'Performance':
        return {category: 'Performance', detail: type};
      case 'Regression':
        return {category: 'Regression', detail: type};
      case 'Security':
        return {category: 'Security', detail: type};
      case 'Automated':
      case 'Acceptance':
      case 'Accessibility':
      case 'Destructive':
      case 'Smoke & Sanity':
      case 'Usability':
      default:
        return {category: 'Custom', detail: type};
    }
  }

  convertStatus(status: string): {category: string; detail: string} {
    switch (status) {
      case 'Passed':
        return {category: 'Success', detail: status};
      case 'Failed':
        return {category: 'Failure', detail: status};
      case 'Untested':
        return {category: 'Skipped', detail: status};
      case 'Blocked':
      case 'Retest':
      default:
        return {category: 'Custom', detail: status};
    }
  }

  suiteUid(projectId: string, suiteId: number): string {
    return `project-${projectId}_suite-${suiteId}`;
  }

  caseUid(projectId: string, suiteId: number, caseId: number): string {
    return `${this.suiteUid(projectId, suiteId)}_case-${caseId}`;
  }

  runUid(projectId: string, suiteId: number, runId: number): string {
    return `${this.suiteUid(projectId, suiteId)}_run-${runId}`;
  }

  resultUid(runId: number, testId: number, resultId: number): string {
    return `run-${runId}_test-${testId}_result-${resultId}`;
  }
}
