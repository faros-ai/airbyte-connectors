import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {AsanaCommon, AsanaConverter, AsanaSection} from './common';

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

export class AsanaTasks extends AsanaConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_Task',
    'tms_Project',
    'tms_TaskProjectRelationship',
    'tms_TaskBoard',
    'tms_TaskBoardRelationship',
    'tms_TaskDependency',
    'tms_TaskAssignment',
    'tms_Label',
    'tms_TaskTag',
  ];

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const res: DestinationRecord[] = [];

    const source = this.streamName.source;
    const task = record.record.data;

    const taskKey = {uid: task.gid, source};
    const status = this.findFieldByName(task.custom_fields, 'status');
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
        status:
          typeof status === 'string' ? this.toTmsTaskStatus(status) : null,
        points: typeof points === 'number' ? points : null,
        additionalFields: task.custom_fields.map((f) => this.toTaskField(f)),
        createdAt: Utils.toDate(task.created_at),
        updatedAt: Utils.toDate(task.modified_at),
        statusChangedAt: Utils.toDate(task.modified_at),
        parent,
        creator: task.assignee ? {uid: task.assignee, source} : null,
      },
    });

    for (const membership of task.memberships) {
      if (membership.project) {
        res.push({
          model: 'tms_Project',
          record: {
            uid: membership.project.gid,
            name: membership.project.name,
            source,
          },
        });
        res.push({
          model: 'tms_TaskProjectRelationship',
          record: {
            task: taskKey,
            project: {uid: membership.project.gid, source},
          },
        });
      }

      if (membership.section) {
        res.push(
          ...this.tms_TaskBoardRelationship(
            taskKey.uid,
            membership.section,
            source
          )
        );
      }
    }

    if (task.assignee) {
      res.push({
        model: 'tms_TaskAssignment',
        record: {
          task: taskKey,
          assignee: {uid: task.assignee, source},
        },
      });
    }
    if (parent) {
      res.push({
        model: 'tms_TaskDependency',
        record: {
          dependentTask: taskKey,
          blocking: false,
          fulfillingTask: parent,
        },
      });
    }
    if (task.assignee_section) {
      res.push(
        ...this.tms_TaskBoardRelationship(
          taskKey.uid,
          task.assignee_section,
          source
        )
      );
    }

    for (const tag of task.tags) {
      if (tag.gid) {
        const label = {name: tag.name};
        res.push({
          model: 'tms_Label',
          record: {name: label.name},
        });
        res.push({
          model: 'tms_TaskTag',
          record: {
            label: {name: label.name},
            task: taskKey,
          },
        });
      }
    }

    return res;
  }

  private tms_TaskBoardRelationship(
    taskId: string,
    section: AsanaSection,
    source: string
  ): DestinationRecord[] {
    const res = [];
    res.push(AsanaCommon.tms_TaskBoard(section, source));
    res.push({
      model: 'tms_TaskBoardRelationship',
      record: {
        task: {uid: taskId, source},
        board: {uid: section.gid, source},
      },
    });
    return res;
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
    const detail = status.toLowerCase();
    switch (detail) {
      case 'done':
        return {category: Tms_TaskStatusCategory.Done, detail};
      case 'inprogress':
        return {category: Tms_TaskStatusCategory.InProgress, detail};
      case 'todo':
        return {category: Tms_TaskStatusCategory.Todo, detail};
      default:
        return {category: Tms_TaskStatusCategory.Custom, detail};
    }
  }
}
