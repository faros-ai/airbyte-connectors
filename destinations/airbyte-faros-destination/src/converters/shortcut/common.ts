import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter} from '../converter';
import {
  EpicStatusCategory,
  Iteration,
  SprintState,
  Story,
  StoryType,
  TaskCategory,
  TaskStatusCategory,
  TaskType,
} from './models';

export class ShortcutCommon {
  // Max length for free-form description text fields such as issue body
  static readonly MAX_DESCRIPTION_LENGTH = 1000;
  static getEpicStatus(status: string): string {
    switch (status) {
      case 'done':
        return EpicStatusCategory.Done;
      case 'in progress':
        return EpicStatusCategory.InProgress;
      default:
        return EpicStatusCategory.Todo;
    }
  }

  static getSprintState(iteration: Iteration): string {
    switch (iteration.status) {
      case 'done':
        return SprintState.Closed;
      case 'started':
        return SprintState.Active;
      case 'unstarted':
        return SprintState.Future;
      default:
        return SprintState.Default;
    }
  }

  static getTaskType(storyType: StoryType): TaskType {
    const detail = storyType;
    switch (storyType) {
      case 'bug':
        return {category: TaskCategory.Bug, detail};
      case 'chore':
      case 'feature':
        return {category: TaskCategory.Story, detail};
      default:
        return {category: TaskCategory.Custom, detail};
    }
  }

  static getTaskStatus(story: Story): string {
    if (story.completed) {
      return TaskStatusCategory.Done;
    } else if (story.started) {
      return TaskStatusCategory.InProgress;
    } else {
      return TaskStatusCategory.Todo;
    }
  }
}

/** Shortcut converter base */
export abstract class ShortcutConverter extends Converter {
  source = 'Shortcut';

  /** Almost every Shortcut record have id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }
}
