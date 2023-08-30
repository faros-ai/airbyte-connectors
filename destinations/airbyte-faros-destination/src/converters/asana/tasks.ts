import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';

import {
  DestinationModel,
  DestinationRecord,
  StreamContext,
  StreamName,
} from '../converter';
import {AsanaCommon, AsanaConverter} from './common';

interface CustomField {
  gid: string;
  name: string;
  text_value?: string;
  number_value?: number;
  display_value?: string;
  enum_value: CustomFieldEnumValue;
  multi_enum_values: CustomFieldEnumValue;
}

interface CustomFieldEnumValue {
  name: string;
}

interface TmsTaskStatus {
  category: Tms_TaskStatusCategory;
  detail: string;
}

enum Tms_TaskStatusCategory {
  Custom = 'Custom',
  Done = 'Done',
  InProgress = 'InProgress',
  Todo = 'Todo',
}

export class Tasks extends AsanaConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_Task',
    'tms_TaskProjectRelationship',
    'tms_TaskBoardRelationship',
    'tms_TaskDependency',
    'tms_TaskAssignment',
    'tms_TaskTag',
  ];

  static readonly tagsStream = new StreamName('asana', 'tags');

  override get dependencies(): ReadonlyArray<StreamName> {
    return [Tasks.tagsStream];
  }

  async convert(
    record: AirbyteRecord,
    ctx?: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const res: DestinationRecord[] = [];

    const source = this.streamName.source;
    const task = record.record.data;

    const taskKey = {uid: task.gid, source};
    const parent = task.parent ? {uid: task.parent.gid, source} : null;
    const priority = this.findFieldByName(task.custom_fields, 'priority');
    const points = this.findFieldByName(task.custom_fields, 'points');

    res.push({
      model: 'tms_Task',
      record: {
        ...taskKey,
        name: task.name,
        description: task.notes?.substring(
          0,
          AsanaCommon.MAX_DESCRIPTION_LENGTH
        ),
        url: task.permalink_url ?? null,
        type: AsanaCommon.toTmsTaskType(task.resource_type),
        priority: typeof priority === 'string' ? priority : null,
        status: this.getStatus(task),
        points: typeof points === 'number' ? points : null,
        additionalFields: task.custom_fields.map((f) => this.toTaskField(f)),
        createdAt: Utils.toDate(task.created_at),
        updatedAt: Utils.toDate(task.modified_at),
        statusChangedAt: Utils.toDate(task.modified_at),
        parent,
      },
    });

    for (const membership of task.memberships ?? []) {
      if (membership.project) {
        res.push({
          model: 'tms_TaskProjectRelationship',
          record: {
            task: taskKey,
            project: {uid: membership.project.gid, source},
          },
        });
      }

      if (membership.section) {
        res.push({
          model: 'tms_TaskBoardRelationship',
          record: {
            task: taskKey,
            board: {uid: membership.section.gid, source},
          },
        });
      }
    }

    if (task.assignee) {
      res.push({
        model: 'tms_TaskAssignment',
        record: {
          task: taskKey,
          assignee: {uid: task.assignee.gid, source},
        },
      });
    }

    if (parent) {
      res.push({
        model: 'tms_TaskDependency',
        record: {
          dependentTask: parent,
          blocking: false,
          fulfillingTask: taskKey,
        },
      });
    }

    for (const tag of task.tags ?? []) {
      if (tag.gid) {
        const tagRec = ctx?.get(Tasks.tagsStream.asString, tag.gid);
        if (!tagRec) {
          continue;
        }

        const label = {name: tagRec.record.data.name};

        res.push({
          model: 'tms_TaskTag',
          record: {
            label,
            task: taskKey,
          },
        });
      }
    }

    return res;
  }

  private getStatus(task: Dictionary<any>): TmsTaskStatus | null {
    const status = this.findFieldByName(task.custom_fields, 'status');

    if (typeof status === 'string') {
      return this.toTmsTaskStatus(status);
    } else if (task.completed) {
      return {category: Tms_TaskStatusCategory.Done, detail: 'completed'};
    } else {
      return null;
    }
  }

  private findFieldByName(
    customFields: CustomField[],
    compareName: string
  ): undefined | string | number {
    for (const f of customFields) {
      const name = f.name.toLowerCase();
      if (name === compareName) {
        return this.toTaskField(f).value;
      }
    }
  }

  private toTaskField(customField: CustomField): {
    name: string;
    value: undefined | string | number;
  } {
    return {
      name: customField.name,
      value:
        customField.text_value ??
        customField.number_value ??
        customField.enum_value?.name ??
        customField.multi_enum_values?.name ??
        customField.display_value,
    };
  }

  private toTmsTaskStatus(status: string): TmsTaskStatus {
    switch (AsanaCommon.normalize(status)) {
      case 'done':
        return {category: Tms_TaskStatusCategory.Done, detail: status};
      case 'inprogress':
        return {category: Tms_TaskStatusCategory.InProgress, detail: status};
      case 'todo':
        return {category: Tms_TaskStatusCategory.Todo, detail: status};
      default:
        return {category: Tms_TaskStatusCategory.Custom, detail: status};
    }
  }
}
