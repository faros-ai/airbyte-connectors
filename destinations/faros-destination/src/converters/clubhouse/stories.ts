import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {
  ClubhouseConverter,
  MAX_DESCRIPTION_LENGTH,
  Story,
  StoryType,
  TaskType,
} from './common';

export class ClubhouseStories extends ClubhouseConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_TaskTag',
    'tms_Label',
    'tms_Task',
    'tms_TaskProjectRelationship',
    'tms_TaskBoardRelationship',
    'tms_TaskDependency',
  ];

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const story = record.record.data as Story;
    const res: DestinationRecord[] = [];

    for (const label of story.labels ?? []) {
      res.push({
        model: 'tms_TaskTag',
        record: {
          label: {name: label.name},
          task: {uid: String(story.id), source},
        },
      });
      res.push({
        model: 'tms_Label',
        record: {name: label.name},
      });
    }

    const taskKey = {uid: String(story.id), source};
    res.push({
      model: 'tms_Task',
      record: {
        ...taskKey,
        name: story.name,
        description: story.description?.substring(0, MAX_DESCRIPTION_LENGTH),
        type: this.getTaskType(story.story_type),
        status: {
          category: this.getStoryStatus(story),
        },
        createdAt: Utils.toDate(story.created_at),
        updatedAt: story.updated_at
          ? Utils.toDate(story.updated_at)
          : undefined,
        creator: story.requested_by_id
          ? {uid: String(story.requested_by_id), source}
          : undefined,
        epic: story.epic_id ? {uid: String(story.epic_id), source} : undefined,
        sprint: story.iteration_id
          ? {uid: String(story.iteration_id), source}
          : undefined,
        parent: undefined,
      },
    });
    res.push({
      model: 'tms_TaskProjectRelationship',
      record: {
        task: taskKey,
        project: {uid: String(story.project_id), source},
      },
    });
    res.push({
      model: 'tms_TaskBoardRelationship',
      record: {
        task: taskKey,
        board: {uid: String(story.project_id), source},
      },
    });
    for (const task of story.tasks ?? []) {
      const description = task.description?.substring(
        0,
        MAX_DESCRIPTION_LENGTH
      );
      res.push({
        model: 'tms_Task',
        record: {
          uid: String(task.id),
          name: description,
          description: description,
          type: {category: 'Task'},
          status: {category: task.complete ? 'Done' : 'Todo'},
          createdAt: Utils.toDate(task.created_at),
          updatedAt: task.updated_at
            ? Utils.toDate(task.updated_at)
            : undefined,
          creator: story.requested_by_id
            ? {uid: String(story.requested_by_id), source}
            : undefined,
          epic: story.epic_id
            ? {uid: String(story.epic_id), source}
            : undefined,
          sprint: story.iteration_id
            ? {uid: String(story.iteration_id), source}
            : undefined,
          parent: {uid: String(story.id), source},
          source,
        },
      });
      res.push({
        model: 'tms_TaskDependency',
        record: {
          dependentTask: {uid: String(story.id), source},
          fulfillingTask: {uid: String(task.id), source},
          blocking: false,
        },
      });
    }
    for (const link of story.story_links ?? []) {
      if (link.verb !== 'blocks') {
        continue;
      }
      res.push({
        model: 'tms_TaskDependency',
        record: {
          dependentTask: {uid: String(link.object_id), source},
          fulfillingTask: {uid: String(link.subject_id), source},
          blocking: true,
        },
      });
    }
    return res;
  }

  getTaskType(storyType: StoryType): TaskType {
    const detail = storyType;
    switch (storyType) {
      case 'bug':
        return {category: 'Bug', detail};
      case 'chore':
      case 'feature':
        return {category: 'Story', detail};
      default:
        return {category: 'Custom', detail};
    }
  }

  getStoryStatus(story: Story): string {
    if (story.completed) {
      return 'Done';
    } else if (story.started) {
      return 'InProgress';
    } else {
      return 'Todo';
    }
  }
}
