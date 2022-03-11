import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter, StreamContext} from '../converter';
import {
  IssueType,
  SprintState,
  TaskCategory,
  TaskStatus,
  TaskStatusCategory,
  TaskType,
  VersionMilestone,
} from './models';

const MAX_DESCRIPTION_LENGTH = 1000;

interface BacklogConfig {
  // Max length for free-form description text fields such as task description
  max_description_length?: number;
}

export class BacklogCommon {
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

  static getTaskStatus(issueName: string): TaskStatus {
    switch (issueName) {
      case 'Resolved':
      case 'Closed':
        return {category: TaskStatusCategory.Done, detail: issueName};
      case 'Open':
        return {category: TaskStatusCategory.Todo, detail: issueName};
      default:
        return {category: TaskStatusCategory.InProgress, detail: issueName};
    }
  }

  static getSprintState(versionMilestone: VersionMilestone): string {
    if (versionMilestone.releaseDueDate) return SprintState.Closed;
    return SprintState.Active;
  }
}

/** Backlog converter base */
export abstract class BacklogConverter extends Converter {
  source = 'Backlog';

  /** Almost every Backlog record have id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }

  protected backlogConfig(ctx: StreamContext): BacklogConfig {
    return ctx.config.source_specific_configs?.backlog ?? {};
  }

  protected maxDescriptionLength(ctx: StreamContext): number {
    return (
      this.backlogConfig(ctx).max_description_length ?? MAX_DESCRIPTION_LENGTH
    );
  }
}
