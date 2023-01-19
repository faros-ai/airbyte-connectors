import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Task} from 'faros-airbyte-common/clickup';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {ClickUpConverter} from './common';

export class Tasks extends ClickUpConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_Label',
    'tms_Task',
    'tms_TaskAssignment',
    'tms_TaskBoardRelationship',
    'tms_TaskProjectRelationship',
    'tms_TaskTag',
  ];

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
        additionalFields: this.customFields(task), // goals
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

    for (const assignee of task.assignees) {
      results.push({
        model: 'tms_TaskAssignment',
        record: {task: taskKey, assignee: {uid: `${assignee.id}`, source}},
      });
    }

    for (const tag of task.tags) {
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

  private customFields(task: Task): {name: string; value: string}[] {
    return (task.custom_fields ?? [])
      .filter((f) => f.value !== undefined)
      .map((f) => {
        return {name: f.name, value: `${f.value}`};
      });
  }
}

function millisToDate(str: string): Date | null {
  const millis = str ? Number(str) : null;
  return Number.isInteger(millis) ? new Date(millis) : null;
}
