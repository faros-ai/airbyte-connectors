import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Goal, Task} from 'faros-airbyte-common/clickup';

import {
  DestinationModel,
  DestinationRecord,
  StreamContext,
  StreamName,
} from '../converter';
import {ClickUpConverter} from './common';

const GOAL_ID_ADDITIONAL_FIELD_NAME = 'Faros__ClickUpGoalId';
const GOAL_NAME_ADDITIONAL_FIELD_NAME = 'Faros__ClickUpGoalName';

export class Tasks extends ClickUpConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_Label',
    'tms_Task',
    'tms_TaskAssignment',
    'tms_TaskBoardRelationship',
    'tms_TaskDependency',
    'tms_TaskProjectRelationship',
    'tms_TaskTag',
  ];

  private readonly goalsStream = new StreamName('clickup', 'goals');

  override get dependencies(): ReadonlyArray<StreamName> {
    return [this.goalsStream];
  }

  private seenTags: Set<string> = new Set();

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const task = record.record.data as Task;
    const source = this.streamName.source;
    const uid = task.id;
    const taskKey = {uid, source};
    const results: DestinationRecord[] = [];

    results.push({
      model: 'tms_Task',
      record: {
        ...taskKey,
        name: task.name,
        description: this.truncate(ctx, task.description),
        url: task.url,
        type: {category: 'Task', detail: 'Task'},
        priority:
          typeof task.priority === 'string'
            ? task.priority
            : task.priority?.priority,
        status: null, // TODO
        additionalFields: this.customFields(task, ctx), // goals
        createdAt: millisToDate(task.date_created),
        updatedAt: millisToDate(task.date_updated),
        statusChangedAt: null, // TODO
        resolvedAt: millisToDate(task.date_closed),
        statusChangelog: null, // TODO
        parent: task.parent ? {uid: task.id, source} : null,
        creator: task.creator ? {uid: `${task.creator.id}`, source} : null,
      },
    });

    results.push({
      model: 'tms_TaskProjectRelationship',
      record: {
        task: taskKey,
        project: {uid: task.computedProperties.workspace.id, source},
      },
    });

    for (const assignee of task.assignees ?? []) {
      results.push({
        model: 'tms_TaskAssignment',
        record: {task: taskKey, assignee: {uid: `${assignee.id}`, source}},
      });
    }

    for (const tag of task.tags ?? []) {
      const label = {name: tag.name};
      results.push({
        model: 'tms_TaskTag',
        record: {task: taskKey, label},
      });
      if (this.seenTags.has(tag.name)) {
        continue;
      }
      results.push({model: 'tms_Label', record: label});
      this.seenTags.add(tag.name);
    }

    for (const linkedTask of task.linked_tasks ?? []) {
      if (linkedTask.task_id !== task.id) {
        continue; // linked_tasks is non-empty for both source and target task
      }
      results.push({
        model: 'tms_TaskDependency',
        record: {
          dependentTask: taskKey,
          fulfillingTask: {uid: linkedTask.link_id, source},
          dependencyType: {category: 'RelatesTo'},
          fulfillingType: {category: 'RelatesTo'},
        },
      });
    }

    const taskboardSources = this.taskboardSources(ctx);
    if (task.list?.id && taskboardSources.includes('list')) {
      results.push({
        model: 'tms_TaskBoardRelationship',
        record: {task: taskKey, board: {uid: task.list.id, source}},
      });
    }
    if (task.folder?.id && taskboardSources.includes('folder')) {
      results.push({
        model: 'tms_TaskBoardRelationship',
        record: {task: taskKey, board: {uid: task.folder.id, source}},
      });
    }
    if (task.space?.id && taskboardSources.includes('space')) {
      results.push({
        model: 'tms_TaskBoardRelationship',
        record: {task: taskKey, board: {uid: task.space.id, source}},
      });
    }

    return results;
  }

  private customFields(
    task: Task,
    ctx: StreamContext
  ): {name: string; value: string}[] {
    const fields = (task.custom_fields ?? [])
      .filter((f) => f.value !== undefined)
      .map((f) => {
        return {name: f.name, value: `${f.value}`};
      });
    for (const rec of Object.values(ctx.getAll(this.goalsStream.asString))) {
      const goal = rec.record.data as Goal;
      for (const target of goal.key_results ?? []) {
        if (
          (target.task_ids ?? []).includes(task.id) ||
          (target.subcategory_ids ?? []).includes(task.list?.id)
        ) {
          fields.push(
            {name: GOAL_ID_ADDITIONAL_FIELD_NAME, value: goal.id},
            {name: GOAL_NAME_ADDITIONAL_FIELD_NAME, value: goal.name}
          );
          break; // Multiple targets in the same goal can include the same task
        }
      }
    }
    return fields;
  }
}

function millisToDate(str: string): Date | null {
  const millis = str ? Number(str) : null;
  return Number.isInteger(millis) ? new Date(millis) : null;
}
