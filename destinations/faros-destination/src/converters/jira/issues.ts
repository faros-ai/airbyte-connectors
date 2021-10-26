import {AirbyteLogger, AirbyteRecord} from 'faros-airbyte-cdk';
import {isString, last} from 'lodash';

import {
  DestinationModel,
  DestinationRecord,
  StreamContext,
  StreamName,
} from '../converter';
import {normalize, toDate} from '../utils';
import {JiraCommon, JiraConverter} from './common';

interface Dependency {
  readonly key: string;
  readonly blocking: boolean;
}
interface Assignee {
  readonly uid: string;
  readonly assignedAt: Date;
}
interface Status {
  readonly category: string;
  readonly detail: string;
}

const dependencyRegex = /((is (?<type>\w+))|tested) by/;
const statusCategories: ReadonlyMap<string, string> = new Map(
  ['Todo', 'InProgress', 'Done'].map((s) => [normalize(s), s])
);
const typeCategories: ReadonlyMap<string, string> = new Map(
  ['Bug', 'Story', 'Task'].map((t) => [normalize(t), t])
);

export class JiraIssues extends JiraConverter {
  private logger = new AirbyteLogger();

  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_Task',
    'tms_TaskProjectRelationship',
    'tms_TaskBoardRelationship',
    'tms_TaskAssignment',
    'tms_TaskDependency',
    'tms_TaskTag',
  ];

  private static readonly issueFieldsStream = new StreamName(
    'jira',
    'issue_fields'
  );
  private static readonly workflowStatusesStream = new StreamName(
    'jira',
    'workflow_statuses'
  );

  private static readonly standardFieldIds = [
    'assignee',
    'created',
    'creator',
    'description',
    'issuelinks',
    'issuetype',
    'labels',
    'parent',
    'priority',
    'project',
    'status',
    'subtasks',
    'summary',
    'updated',
  ];

  private static readonly fieldsToIgnore = [
    ...JiraCommon.POINTS_FIELD_NAMES,
    JiraCommon.DEV_FIELD_NAME,
    JiraCommon.EPIC_LINK_FIELD_NAME,
    JiraCommon.SPRINT_FIELD_NAME,
  ];

  private fieldNameById?: ReadonlyMap<string, string>;
  private statusByName?: ReadonlyMap<string, Status>;

  override get dependencies(): ReadonlyArray<StreamName> {
    return [JiraIssues.issueFieldsStream, JiraIssues.workflowStatusesStream];
  }

  private static getFieldNamesById(
    ctx: StreamContext
  ): ReadonlyMap<string, string> {
    const map = new Map<string, string>();
    const records = ctx.records(JiraIssues.issueFieldsStream.stringify());
    for (const [id, recs] of Object.entries(records)) {
      for (const rec of recs) {
        const name = rec.record?.data?.name;
        if (id && name) {
          map.set(id, name);
        }
      }
    }
    return map;
  }

  private static getStatusesByName(
    ctx: StreamContext
  ): ReadonlyMap<string, Status> {
    const map = new Map<string, Status>();
    const records = ctx.records(JiraIssues.workflowStatusesStream.stringify());
    for (const [id, recs] of Object.entries(records)) {
      for (const rec of recs) {
        const detail = rec.record?.data?.name;
        const category = rec.record?.data?.statusCategory?.name;
        if (detail && category) {
          map.set(detail, {category, detail});
        }
      }
    }
    return map;
  }

  private static fieldChangelog(
    changelog: ReadonlyArray<any>,
    field: string,
    valueField = 'toString'
  ): ReadonlyArray<{
    from: string;
    field: string;
    value: string;
    changed: Date;
  }> {
    const fieldChangelog = [];
    // Changelog entries are sorted from most to least recent
    for (const change of changelog) {
      for (const item of change.items) {
        if (item.field === field) {
          const changed = toDate(change.created);
          if (!changed) {
            continue;
          }
          fieldChangelog.push({
            from: item.from,
            field,
            value: item[valueField],
            changed,
          });
        }
      }
    }
    return fieldChangelog;
  }

  static assigneeChangelog(
    changelog: ReadonlyArray<any>,
    currentAssignee: any,
    created: Date
  ): ReadonlyArray<Assignee> {
    const assigneeChangelog: Array<Assignee> = [];

    // sort assignees from earliest to latest
    const assigneeChanges = [
      ...JiraIssues.fieldChangelog(changelog, 'assignee', 'to'),
    ].reverse();

    if (assigneeChanges.length) {
      // case where task was already assigned at creation
      const firstChange = assigneeChanges[0];
      if (firstChange.from) {
        const assignee = {uid: firstChange.from, assignedAt: created};
        assigneeChangelog.push(assignee);
      }

      for (const change of assigneeChanges) {
        const assignee = {uid: change.value, assignedAt: change.changed};
        assigneeChangelog.push(assignee);
      }
    } else if (currentAssignee) {
      // if task was assigned at creation and never changed
      assigneeChangelog.push({uid: currentAssignee, assignedAt: created});
    }
    return assigneeChangelog;
  }

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const issue = record.record.data;
    const source = this.streamName.source;
    const results: DestinationRecord[] = [];

    if (!this.fieldNameById) {
      this.fieldNameById = JiraIssues.getFieldNamesById(ctx);
    }
    if (!this.statusByName) {
      this.statusByName = JiraIssues.getStatusesByName(ctx);
    }

    results.push({
      model: 'tms_TaskProjectRelationship',
      record: {
        task: {uid: issue.key, source},
        project: {uid: issue.projectKey, source},
      },
    });
    if (!this.useBoardOwnership) {
      results.push({
        model: 'tms_TaskBoardRelationship',
        record: {
          task: {uid: issue.key, source},
          board: {uid: issue.projectKey, source},
        },
      });
    }
    for (const label of issue.fields.labels) {
      results.push({
        model: 'tms_TaskTag',
        record: {label: {name: label}, task: {uid: issue.key, source}},
      });
    }

    const created = toDate(issue.fields.created);
    const assignee =
      issue.fields.assignee?.accountId || issue.fields.assignee?.name;
    const changelog: any[] = issue.changelog?.histories || [];
    changelog.sort((e1, e2) => {
      // Sort changes from most to least recent
      const created1 = +(toDate(e1.created) || new Date(0));
      const created2 = +(toDate(e2.created) || new Date(0));
      return created2 - created1;
    });
    const assigneeChangelog = JiraIssues.assigneeChangelog(
      changelog,
      assignee,
      created
    );
    for (const assignee of assigneeChangelog) {
      results.push({
        model: 'tms_TaskAssignment',
        record: {
          task: {uid: issue.key, source},
          assignee: {uid: assignee.uid, source},
          assignedAt: assignee.assignedAt,
        },
      });
    }

    const statusChangelog: any[] = [];
    for (const change of JiraIssues.fieldChangelog(changelog, 'status')) {
      const status = this.statusByName.get(change.value);
      if (status) {
        statusChangelog.push({
          status: {
            category: statusCategories.get(normalize(status.category)),
            detail: status.detail,
          },
          changedAt: change.changed,
        });
      }
    }
    // Timestamp of most recent status change
    let statusChanged: Date | undefined;
    if (statusChangelog.length) {
      statusChanged = last(statusChangelog).changedAt;
    }

    for (const link of issue.fields.issuelinks ?? []) {
      const match = link.type.inward?.match(dependencyRegex);
      const dependency = link.inwardIssue?.key;
      if (match && dependency) {
        const blocking = match.groups.type === 'blocked';
        results.push({
          model: 'tms_TaskDependency',
          record: {
            dependentTask: {uid: issue.key, source},
            fulfillingTask: {uid: dependency, source},
            blocking,
          },
        });
      }
    }

    // Rewrite keys of additional fields to use names instead of ids
    const additionalFields: any[] = [];
    for (const [id, name] of this.fieldNameById.entries()) {
      let value = issue.fields[id];
      if (
        JiraIssues.standardFieldIds.includes(id) ||
        JiraIssues.fieldsToIgnore.includes(name)
      ) {
        continue;
      } else if (name && value) {
        try {
          // Stringify arrays, objects, booleans, and numbers
          value = isString(value) ? value : JSON.stringify(value);
          additionalFields.push({name, value});
        } catch (err) {
          this.logger.warn(
            `Failed to extract custom field ${name} on issue ${issue.id}. Skipping.`
          );
        }
      }
    }

    const creator =
      issue.fields.creator?.accountId || issue.fields.creator?.name;
    const parent = issue.fields.parent?.key
      ? {
          key: issue.fields.parent?.key,
          type: issue.fields.parent?.fields?.issuetype?.name,
        }
      : null;
    const epicKey = parent?.type === 'Epic' ? parent.key : issue.epic; // TODO: issue.epic
    // TODO: PRs
    const type = issue.fields.issuetype?.name;

    results.push({
      model: 'tms_Task',
      record: {
        uid: issue.key,
        name: issue.fields.summary,
        description: issue.fields.description,
        type: {
          category: typeCategories.get(normalize(type)) ?? 'Custom',
          detail: type,
        },
        status: {
          category: statusCategories.get(
            normalize(issue.fields.status?.statusCategory?.name)
          ),
          detail: issue.fields.status?.name,
        },
        priority: issue.fields.priority?.name,
        createdAt: created,
        updatedAt: toDate(issue.fields.updated),
        statusChangedAt: statusChanged,
        statusChangelog,
        points: null, // TODO
        creator: creator ? {uid: creator, source} : null,
        parent: parent ? {uid: parent.key, source} : null,
        epic: epicKey ? {uid: epicKey, source} : null,
        sprint: null, // TODO
        source,
        additionalFields,
      },
    });

    console.log(JSON.stringify(results.filter((r) => r.model === 'tms_Task')));
    return results;
  }
}
