import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Issue} from 'faros-airbyte-common/jira';
import {Utils} from 'faros-js-client';
import {isNil, pick} from 'lodash';

import {FLUSH} from '../../common/types';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {JiraCommon, JiraConverter, JiraStatusCategories} from './common';

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
  taskTags: DestinationRecord[] = [];
  taskDependencies: DestinationRecord[] = [];
  taskComments: DestinationRecord[] = [];
  seenIssues: Set<string> = new Set();

  fetchIssueComments: boolean = false;

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const issue = record.record.data as Issue;

    if (issue.updateAdditionalFields) {
      return [this.convertAdditionalFieldsIssue(issue)];
    }

    const source = this.initializeSource(ctx);
    const results: DestinationRecord[] = [];

    this.seenIssues.add(issue.key);

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
          category: JiraStatusCategories.get(
            JiraCommon.normalize(status.category)
          ),
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
        category: JiraStatusCategories.get(
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

    if (this.useProjectsAsBoards(ctx)) {
      results.push({
        model: 'tms_TaskBoardRelationship',
        record: {
          task: {uid: issue.key, source},
          board: {uid: issue.project, source},
        },
      });
    }

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
          project: {uid: issue.project, source},
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
              unassignedAt: assignee.unassignedAt,
            },
          });
        }
      }
    }

    for (const dependency of issue.dependencies) {
      const fulfillingType = fulfillingTypeCategories.get(
        JiraCommon.normalize(dependency.outward)
      );
      this.taskDependencies.push({
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
      this.taskTags.push({
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

    if (issue.comments) {
      this.fetchIssueComments = true;
      for (const comment of issue.comments) {
        this.taskComments.push({
          model: 'tms_TaskComment',
          record: {
            task: {uid: issue.key, source},
            uid: comment.id,
            comment: Utils.cleanAndTruncate(
              comment.body,
              this.truncateLimit(ctx)
            ),
            createdAt: comment.created,
            updatedAt: comment.updated,
            author: comment.author?.accountId
              ? {uid: comment.author.accountId, source}
              : undefined,
            replyTo: comment.parentId
              ? {task: {uid: issue.key, source}, uid: comment.parentId}
              : undefined,
          },
        });
      }
    }

    const ancestors = this.updateAncestors(issue);
    return [...results, ...ancestors];
  }

  async onProcessingComplete(): Promise<ReadonlyArray<DestinationRecord>> {
    return [
      ...this.convertDependencies(),
      ...this.convertLabels(),
      ...this.convertComments(),
    ];
  }

  private convertDependencies(): DestinationRecord[] {
    return [
      ...Array.from(this.seenIssues.keys()).map((issueKeyStr) => ({
        model: 'tms_TaskDependency__Deletion',
        record: {
          flushRequired: false,
          where: {
            dependentTask: {uid: issueKeyStr, source: this.source},
          },
        },
      })),
      FLUSH,
      ...this.taskDependencies,
    ];
  }

  private convertLabels(): DestinationRecord[] {
    return [
      ...Array.from(this.seenIssues.keys()).map((issueKeyStr) => ({
        model: 'tms_TaskTag__Deletion',
        record: {
          flushRequired: false,
          where: {
            task: {uid: issueKeyStr, source: this.source},
          },
        },
      })),
      FLUSH,
      ...this.taskTags,
    ];
  }

  private convertComments(): DestinationRecord[] {
    if (!this.fetchIssueComments) {
      return [];
    }
    return [
      ...Array.from(this.seenIssues.keys()).map((issueKeyStr) => ({
        model: 'tms_TaskComment__Deletion',
        record: {
          flushRequired: false,
          where: {
            task: {uid: issueKeyStr, source: this.source},
          },
        },
      })),
      FLUSH,
      ...this.taskComments,
    ];
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
              category: JiraStatusCategories.get(
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
    }

    return results;
  }
}
