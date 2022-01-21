import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter} from '../converter';
import {
  IssueType,
  SprintState,
  TaskCategory,
  TaskStatusCategory,
  TaskType,
  VersionMilestone,
} from './models';

export class BacklogCommon {
  // Max length for free-form description text fields such as issue body
  static readonly MAX_DESCRIPTION_LENGTH = 1000;

  static getTaskType(issueType: IssueType): TaskType {
    const detail = issueType.name;
    const issueTypeName = issueType.name;
    switch (issueTypeName) {
      case 'Bug':
        return {category: TaskCategory.Bug, detail};
      case 'Task':
      case 'Request':
        return {category: TaskCategory.Story, detail};
      default:
        return {category: TaskCategory.Custom, detail};
    }
  }

  static getTaskStatus(issueName: string): string {
    switch (issueName) {
      case 'Resolved':
      case 'Closed':
        return TaskStatusCategory.Done;
      case 'Open':
        return TaskStatusCategory.Todo;
      default:
        return TaskStatusCategory.InProgress;
    }
  }

  static getSprintState(versionMilestone: VersionMilestone): string {
    if (versionMilestone.releaseDueDate) return SprintState.Closed;
    return SprintState.Active;
  }
}

/** Backlog converter base */
export abstract class BacklogConverter extends Converter {
  /** Almost every Backlog record have id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }
}
