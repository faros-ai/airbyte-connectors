import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Issue} from 'faros-airbyte-common/jira';
import {Utils} from 'faros-js-client';
import {isNil, pick} from 'lodash';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {JiraCommon, JiraConverter} from './common';

const statusCategories: ReadonlyMap<string, string> = new Map(
  ['Todo', 'InProgress', 'Done'].map((s) => [JiraCommon.normalize(s), s])
);

const typeCategories: ReadonlyMap<string, string> = new Map(
  ['Bug', 'Story', 'Task'].map((t) => [JiraCommon.normalize(t), t])
);

const dependentTypeCategories: ReadonlyMap<string, string> = new Map(
  [
    'BlockedBy',
    'ClonedBy',
    'CreatedBy',
    'DuplicatedBy',
    'RelatesTo',
    'TestedBy',
  ].map((d) => [JiraCommon.normalize(d), d])
);

const fulfillingTypeCategories: ReadonlyMap<string, string> = new Map(
  ['Blocks', 'Clones', 'Created', 'Duplicates', 'RelatesTo', 'Tests'].map(
    (f) => [JiraCommon.normalize(f), f]
  )
);

export class FarosIssues extends JiraConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_Epic',
    'tms_Label',
    'tms_SprintHistory',
    'tms_Task',
    'tms_TaskAssignment',
    'tms_TaskDependency',
    'tms_TaskProjectRelationship',
    'tms_TaskTag',
  ];

  labels: Set<string> = new Set();

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const issue = record.record.data as Issue;
    const source = this.streamName.source;
    const results: DestinationRecord[] = [];

    if (issue.updateAdditionalFields) {
      return [this.convertAdditionalFieldsIssue(issue)];
    }

    // For next-gen projects, epic should be parent of issue with issue
    // type Epic otherwise use the epic key from custom field in the issue
    const epicKey =
      issue.parent?.type === 'Epic' ? issue.parent.key : issue.epic;

    const additionalFields: any[] = [];
    for (const [name, value] of issue.additionalFields) {
      additionalFields.push({name, value});
    }

    const statusChangelog: any[] = [];
    for (const [status, changedAt] of issue.statusChangelog) {
      statusChangelog.push({
        status: {
          category: statusCategories.get(JiraCommon.normalize(status.category)),
          detail: status.detail,
        },
        changedAt,
      });
    }

    const task = {
      uid: issue.key,
      name: issue.summary,
      description: Utils.cleanAndTruncate(
        issue.description,
        this.truncateLimit(ctx)
      ),
      url: issue.url,
      type: {
        category:
          typeCategories.get(JiraCommon.normalize(issue.type)) ?? 'Custom',
        detail: issue.type,
      },
      status: {
        category: statusCategories.get(
          JiraCommon.normalize(issue.status.category)
        ),
        detail: issue.status.detail,
      },
      priority: issue.priority,
      createdAt: issue.created,
      updatedAt: issue.updated,
      statusChangedAt: issue.statusChanged,
      statusChangelog,
      points: issue.points ?? undefined,
      creator: issue.creator ? {uid: issue.creator, source} : undefined,
      parent: issue.parent ? {uid: issue.parent.key, source} : undefined,
      epic: epicKey ? {uid: epicKey, source} : undefined,
      sprint: issue.sprintInfo?.currentSprintId
        ? {uid: issue.sprintInfo.currentSprintId, source}
        : undefined,
      source,
      additionalFields,
      resolutionStatus: issue.resolution,
      resolvedAt: issue.resolutionDate,
      sourceSystemId: issue.id,
    };

    results.push({model: 'tms_Task', record: task});

    results.push({
      model: 'tms_TaskProjectRelationship',
      record: {
        task: {uid: issue.key, source},
        project: {uid: issue.project, source},
      },
    });

    if (JiraCommon.normalize(issue.type) === 'epic') {
      results.push({
        model: 'tms_Epic',
        record: {
          ...pick(task, [
            'uid',
            'name',
            'createdAt',
            'updatedAt',
            'description',
            'status',
            'source',
          ]),
          project: {uid: issue.project, source: this.source},
        },
      });
    }

    if (issue.assignees) {
      // assignees are sorted form earliest to latest
      // so if the same assignee got assigned multiple times
      // the last assignment timestamp would overwrite previous ones
      for (const assignee of issue.assignees) {
        if (!isNil(assignee.uid)) {
          results.push({
            model: 'tms_TaskAssignment',
            record: {
              task: {uid: issue.key, source},
              assignee: {uid: assignee.uid, source},
              assignedAt: assignee.assignedAt,
            },
          });
        }
      }
    }

    for (const dependency of issue.dependencies) {
      const fulfillingType = fulfillingTypeCategories.get(
        JiraCommon.normalize(dependency.outward)
      );
      results.push({
        model: 'tms_TaskDependency',
        record: {
          dependentTask: {uid: issue.key, source},
          fulfillingTask: {uid: dependency.key, source},
          blocking: fulfillingType === 'Blocks',
          dependencyType: {
            category: this.toDependentType(dependency.inward) ?? 'Custom',
            detail: dependency.inward,
          },
          fulfillingType: {
            category: fulfillingType ?? 'Custom',
            detail: dependency.outward,
          },
        },
      });
    }

    for (const label of issue.labels) {
      if (!this.labels.has(label)) {
        results.push({model: 'tms_Label', record: {name: label}});
        this.labels.add(label);
      }
      results.push({
        model: 'tms_TaskTag',
        record: {
          label: {name: label},
          task: {uid: issue.key, source},
        },
      });
    }

    for (const sprint of issue.sprintInfo?.history || []) {
      results.push({
        model: 'tms_SprintHistory',
        record: {
          task: {uid: issue.key, source},
          sprint: {uid: sprint.uid, source},
          addedAt: sprint.addedAt,
          removedAt: sprint.removedAt,
        },
      });
    }

    this.updateAncestors(issue);
    return results;
  }

  private toDependentType(name: string): string | undefined {
    const dependencyRegex = /((is)?(?<type>(\w+) (by|to)))/;
    const match = name.match(dependencyRegex);
    if (match) {
      return dependentTypeCategories.get(
        JiraCommon.normalize(match.groups.type)
      );
    }
  }

  /**
   * Updates the status of previous versions of this issue, one for each
   * project it used to be located in. These versions no longer exist in Jira,
   * but may exist in the graph due to past syncs.
   */
  private updateAncestors(issue: Issue): ReadonlyArray<DestinationRecord> {
    if (!issue.keyChangelog.length) {
      return [];
    }

    const results: DestinationRecord[] = [];

    for (const [ancestorKey, keyChangedAt] of issue.keyChangelog) {
      // Append the new status to the status changelog as it was when the
      // issue was moved to the next project
      const statusChangelog: any[] = [];
      for (const [status, statusChangedAt] of issue.statusChangelog) {
        if (statusChangedAt <= keyChangedAt) {
          statusChangelog.push({
            status: {
              category: statusCategories.get(
                JiraCommon.normalize(status.category)
              ),
              detail: status.detail,
            },
            changedAt: statusChangedAt,
          });
        }
      }
      const updatedStatus = {category: 'Custom', detail: 'Moved'};
      statusChangelog.push({status: updatedStatus, changedAt: keyChangedAt});

      results.push({
        model: 'tms_Task__Update',
        record: {
          where: {uid: ancestorKey, source: this.source},
          mask: ['status', 'statusChangelog', 'statusChangedAt', 'updatedAt'],
          patch: {
            status: updatedStatus,
            statusChangelog: [...statusChangelog],
            statusChangedAt: keyChangedAt,
            updatedAt: keyChangedAt,
          },
        },
      });

      return results;
    }
  }
}
