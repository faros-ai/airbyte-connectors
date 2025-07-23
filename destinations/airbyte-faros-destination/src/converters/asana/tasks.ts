import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';

import {FLUSH} from '../../common/types';
import {
  DestinationModel,
  DestinationRecord,
  StreamContext,
  StreamName,
} from '../converter';
import {AsanaCommon, AsanaConverter} from './common';
import {ProjectTasks} from './project_tasks';
import {Projects} from './projects';

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
  private readonly seenProjects: Set<string> = new Set();
  private readonly seenTasks: Set<string> = new Set();
  private readonly taskComments: DestinationRecord[] = [];
  private fetchTaskComments: boolean = false;

  private initialize(ctx?: StreamContext): void {
    this.config =
      this.config ?? ctx?.config.source_specific_configs?.asana ?? {};
  }

  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_Task',
    'tms_TaskDependency',
    'tms_TaskAssignment',
    'tms_TaskTag',
    'tms_TaskComment',
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

    // Track this task for comment deletion
    this.seenTasks.add(task.gid);

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

    for (const membership of task.memberships ?? []) {
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
      if (membership.project && this.shouldProcessProjectMembership()) {
        if (!this.seenProjects.has(membership.project.gid)) {
          res.push(...Projects.convertProject(membership.project, source));
          this.seenProjects.add(membership.project.gid);
        }

        res.push(
          ...ProjectTasks.convertProjectTask(
            {
              project_gid: membership.project.gid,
              task_gid: task.gid,
            },
            source
          )
        );
      }
    }

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

    // Process comments following Jira pattern
    if (task.comments) {
      this.fetchTaskComments = true;
      for (const comment of task.comments) {
        this.taskComments.push({
          model: 'tms_TaskComment',
          record: {
            task: taskKey,
            uid: comment.gid,
            comment: Utils.cleanAndTruncate(
              comment.text,
              AsanaCommon.MAX_DESCRIPTION_LENGTH
            ),
            createdAt: Utils.toDate(comment.created_at),
            updatedAt: Utils.toDate(comment.created_at), // Asana stories don't have updated_at
            author: comment.created_by?.gid
              ? {uid: comment.created_by.gid, source}
              : undefined,
            // Note: Asana comments don't have reply structure like Jira
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

  protected shouldProcessProjectMembership(): boolean {
    return false;
  }

  async onProcessingComplete(
    _ctx?: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    return [...this.convertComments()];
  }

  private convertComments(): DestinationRecord[] {
    if (!this.fetchTaskComments) {
      return [];
    }
    return [
      // Delete existing comments for all processed tasks
      ...Array.from(this.seenTasks.keys()).map((taskGid) => ({
        model: 'tms_TaskComment__Deletion',
        record: {
          flushRequired: false,
          where: {
            task: {uid: taskGid, source: this.source},
          },
        },
      })),
      FLUSH,
      // Insert all new comments
      ...this.taskComments,
    ];
  }
}
