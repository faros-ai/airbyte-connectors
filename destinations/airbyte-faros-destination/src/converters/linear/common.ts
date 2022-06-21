import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter, StreamContext} from '../converter';
import {
  CommonKey,
  EpicStatusCategory,
  SprintState,
  TaskCategory,
  TaskStatus,
  TaskStatusCategory,
  TaskType,
} from './models';

const MAX_DESCRIPTION_LENGTH = 1000;

interface LinearConfig {
  // Max length for free-form description text fields such as task description
  max_description_length?: number;
}

export class LinearCommon {
  static getTaskType(issueType: CommonKey): TaskType {
    const detail = issueType.name;
    const issueTypeName = issueType.name;
    switch (issueTypeName) {
      case 'Bug':
        return {category: TaskCategory.Bug, detail};
      case 'Feature':
      case 'improvement':
        return {category: TaskCategory.Story, detail};
      default:
        return {category: TaskCategory.Custom, detail};
    }
  }

  static getTaskStatus(issueName: string): TaskStatus {
    switch (issueName) {
      case 'Done':
        return {category: TaskStatusCategory.Done, detail: issueName};
      case 'Todo':
        return {category: TaskStatusCategory.Todo, detail: issueName};

      default:
        return {category: TaskStatusCategory.InProgress, detail: issueName};
    }
  }

  static getSprintState(completedAt: string): string {
    if (completedAt) return SprintState.Closed;
    return SprintState.Active;
  }
  static getEpicStatus(completedAt: string): string {
    if (completedAt) return EpicStatusCategory.Done;
    return EpicStatusCategory.InProgress;
  }
}

/** Linear converter base */
export abstract class LinearConverter extends Converter {
  source = 'Linear';

  /** Almost every Linear record have id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }

  protected linearConfig(ctx: StreamContext): LinearConfig {
    return ctx.config.source_specific_configs?.backlog ?? {};
  }

  protected maxDescriptionLength(ctx: StreamContext): number {
    return (
      this.linearConfig(ctx).max_description_length ?? MAX_DESCRIPTION_LENGTH
    );
  }
}
