import {AirbyteRecord} from 'faros-airbyte-cdk';

import {
  DestinationModel,
  DestinationRecord,
  StreamContext,
  StreamName,
} from '../converter';
import {toDate} from '../utils';
import {JiraConverter} from './common';

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

export class JiraIssues extends JiraConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_Task',
    'tms_TaskProjectRelationship',
    'tms_TaskBoardRelationship',
    'tms_TaskAssignment',
    'tms_TaskDependency',
    'tms_TaskTag',
  ];

  private static readonly workflowStatusesStream = new StreamName(
    'jira',
    'workflow_statuses'
  );

  private statusByName?: ReadonlyMap<string, Status>;

  override get dependencies(): ReadonlyArray<StreamName> {
    return [JiraIssues.workflowStatusesStream];
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

    const statusChangelog: [Status, Date][] = [];
    for (const change of JiraIssues.fieldChangelog(changelog, 'status')) {
      const status = this.statusByName.get(change.value);
      if (status) {
        statusChangelog.push([status, change.changed]);
      }
    }
    // Timestamp of most recent status change
    let statusChanged: Date | undefined;
    if (statusChangelog.length) {
      [[, statusChanged]] = statusChangelog;
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

    // console.log(JSON.stringify(results.filter(r => r.model === 'tms_TaskAssignment')));
    return results;
  }
}
