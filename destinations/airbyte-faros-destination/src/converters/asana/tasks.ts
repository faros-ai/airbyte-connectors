import {AirbyteRecord, DestinationSyncMode} from 'faros-airbyte-cdk';
import {paginatedQueryV2, Utils} from 'faros-js-client';
import {isNil} from 'lodash';
import {Dictionary} from 'ts-essentials';

import {
  DestinationModel,
  DestinationRecord,
  StreamContext,
  StreamName,
} from '../converter';
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

interface TmsTaskStatusChange {
  status: TmsTaskStatus;
  changedAt: Date;
}

enum Tms_TaskStatusCategory {
  Custom = 'Custom',
  Done = 'Done',
  InProgress = 'InProgress',
  Todo = 'Todo',
}

interface Config {
  task_custom_fields?: ReadonlyArray<string>;
}

export class Tasks extends AsanaConverter {
  private config: Config = undefined;

  private initialize(ctx?: StreamContext): void {
    this.config =
      this.config ?? ctx?.config.source_specific_configs?.asana ?? {};
  }

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
    this.initialize(ctx);

    const res: DestinationRecord[] = [];

    const source = this.streamName.source;
    const task = record.record.data;

    const taskKey = {uid: task.gid, source};
    const parent = task.parent ? {uid: task.parent.gid, source} : null;

    const taskCustomFields = (task.custom_fields ?? []).filter((f) =>
      this.config.task_custom_fields?.includes(f.gid)
    );

    const statusChangelog: TmsTaskStatusChange[] = [];

    for (const story of task.stories ?? []) {
      statusChangelog.push({
        changedAt: story.created_at,
        status: Utils.toCategoryDetail(
          Tms_TaskStatusCategory,
          story.resource_subtype,
          {
            marked_complete: Tms_TaskStatusCategory.Done,
            marked_incomplete: Tms_TaskStatusCategory.Todo,
            assigned: Tms_TaskStatusCategory.InProgress,
            unassigned: Tms_TaskStatusCategory.Todo,
            marked_duplicate: Tms_TaskStatusCategory.Done,
            unmarked_duplicate: Tms_TaskStatusCategory.Todo,
          }
        ),
      });
    }

    const additionalFields = taskCustomFields.map((f) => this.toTaskField(f));
    const projectMemberships = new Set<string>();

    for (const membership of task.memberships ?? []) {
      if (membership.project) {
        projectMemberships.add(membership.project.gid);
        res.push({
          model: 'tms_TaskBoardRelationship',
          record: {
            task: taskKey,
            board: {uid: membership.project.gid, source},
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
        additionalFields.push({
          name: 'section_gid',
          value: membership.section.gid,
        });
        additionalFields.push({
          name: 'section_name',
          value: membership.section.name,
        });
      }
    }

    res.push(
      ...(await this.deleteOldProjectMemberships(
        taskKey,
        projectMemberships,
        ctx
      ))
    );

    res.push({
      model: 'tms_Task',
      record: {
        ...taskKey,
        name: task.name,
        description: Utils.cleanAndTruncate(
          task.notes,
          AsanaCommon.MAX_DESCRIPTION_LENGTH
        ),
        url: task.permalink_url ?? null,
        type: AsanaCommon.toTmsTaskType(task.resource_type),
        status: this.getStatus(task),
        additionalFields,
        createdAt: Utils.toDate(task.created_at),
        updatedAt: Utils.toDate(task.modified_at),
        statusChangedAt: Utils.toDate(task.modified_at),
        parent,
        statusChangelog: statusChangelog ?? null,
        resolvedAt: Utils.toDate(task.completed_at),
      },
    });

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
    if (task.completed) {
      return {category: Tms_TaskStatusCategory.Done, detail: 'completed'};
    } else {
      // In Asana, tasks are incomplete by default.
      // Users may or may not have a custom field for status.
      return {category: Tms_TaskStatusCategory.Todo, detail: 'incomplete'};
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

  private async deleteOldProjectMemberships(
    taskKey: {uid: string; source: string},
    projectMemberships: Set<string>,
    ctx?: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    if (
      !ctx ||
      ctx.streamsSyncMode[this.streamName.asString] ===
        DestinationSyncMode.OVERWRITE ||
      isNil(ctx.farosClient) ||
      isNil(ctx.graph)
    ) {
      return [];
    }

    const query = `
    {
      tms_Task(
        where: {_and: [{uid: {_eq: "${taskKey.uid}"}}, {source: {_eq: "${taskKey.source}"}}]}
      ) {
        boards {
          board {
            uid
            source
          }
        }
        projects {
          project {
            uid
            source
          }
        }
      }
    }`;

    const projectMembershipsToDelete = new Set<string>();

    for await (const task of ctx.farosClient.nodeIterable(
      ctx.graph,
      query,
      100,
      paginatedQueryV2
    )) {
      for (const board of task.boards || []) {
        if (
          !projectMemberships.has(board.board.uid) &&
          board.board.source === this.source
        ) {
          projectMembershipsToDelete.add(board.board.uid);
        }
      }

      for (const project of task.projects || []) {
        if (
          !projectMemberships.has(project.project.uid) &&
          project.project.source === this.source
        ) {
          projectMembershipsToDelete.add(project.project.uid);
        }
      }
    }

    const res: DestinationRecord[] = [];

    for (const project of projectMembershipsToDelete) {
      res.push({
        model: 'tms_TaskBoardRelationship__Deletion',
        record: {
          where: {
            task: taskKey,
            board: {uid: project, source: this.source},
          },
        },
      });
      res.push({
        model: 'tms_TaskProjectRelationship__Deletion',
        record: {
          where: {
            task: taskKey,
            project: {uid: project, source: this.source},
          },
        },
      });
    }

    return res;
  }
}
