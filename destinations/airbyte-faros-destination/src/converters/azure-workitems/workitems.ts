import {AirbyteLogger, AirbyteRecord} from 'faros-airbyte-cdk';
import {
  WorkItemAssigneeRevision,
  WorkItemIterationRevision,
  WorkItemStateRevision,
  WorkItemWithRevisions,
} from 'faros-airbyte-common/azure-devops';
import {Utils} from 'faros-js-client';

import {FLUSH} from '../../common/types';
import {getUniqueName} from '../common/azure-devops';
import {CategoryDetail} from '../common/common';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {AzureWorkitemsConverter} from './common';
import {TaskKey, TaskStatusChange} from './models';
export class Workitems extends AzureWorkitemsConverter {
  private readonly projectAreaPaths = new Map<string, Set<string>>();
  private readonly areaPathIterations = new Map<string, Set<string>>();
  private readonly seenWorkItems: Set<string> = new Set();
  private readonly workItemComments: DestinationRecord[] = [];
  private fetchWorkItemComments: boolean = false;

  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_Epic',
    'tms_SprintBoardRelationship',
    'tms_SprintHistory',
    'tms_Task',
    'tms_TaskAssignment',
    'tms_TaskBoard',
    'tms_TaskBoardProjectRelationship',
    'tms_TaskBoardRelationship',
    'tms_TaskProjectRelationship',
    'tms_TaskTag',
    'tms_TaskComment',
    'qa_TestCase',
    'qa_TestCaseWorkItemAssociation',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.source;
    const WorkItem = record.record.data as WorkItemWithRevisions;
    const taskKey = {uid: String(WorkItem.id), source};
    const projectId = String(WorkItem.project.id);
    const workItemType = WorkItem.fields['System.WorkItemType'];

    if (workItemType === 'Test Case') {
      return this.convertTestCase(WorkItem, source);
    }

    // Track this work item for comment deletion
    this.seenWorkItems.add(String(WorkItem.id));

    // Process comments if present
    if ((WorkItem as any).comments) {
      this.fetchWorkItemComments = true;
      for (const comment of (WorkItem as any).comments) {
        this.workItemComments.push({
          model: 'tms_TaskComment',
          record: {
            task: taskKey,
            uid: String(comment.id),
            comment: Utils.cleanAndTruncate(comment.text),
            createdAt: Utils.toDate(comment.createdDate),
            updatedAt: Utils.toDate(
              comment.modifiedDate ?? comment.createdDate
            ),
            author: comment.createdBy?.uniqueName
              ? {uid: comment.createdBy.uniqueName, source}
              : undefined,
          },
        });
      }
    }

    const areaPath = this.collectAreaPath(
      WorkItem.fields['System.AreaPath'],
      projectId
    );
    const taskBoard = this.convertAreaPath(taskKey, areaPath);
    const statusChangelog = this.convertStateRevisions(
      WorkItem.revisions.states
    );
    const assignees = this.convertAssigneeRevisions(
      taskKey,
      WorkItem.revisions.assignees,
      ctx?.logger
    );
    const sprintHistory = this.convertIterationRevisions(
      taskKey,
      WorkItem.revisions.iterations,
      areaPath
    );

    const tags = this.getTags(taskKey, WorkItem.fields['System.Tags']);
    const status = this.getStatusMapping(
      WorkItem.fields['Faros']['WorkItemStateCategory']
    );

    const epic = this.getEpic(taskKey, WorkItem.fields, status, projectId);

    return [
      {
        model: 'tms_Task',
        record: {
          ...taskKey,
          url: WorkItem._links?.html?.href || WorkItem.url,
          type: this.getTaskType(WorkItem.fields['System.WorkItemType']),
          name: WorkItem.fields['System.Title'],
          createdAt: Utils.toDate(WorkItem.fields['System.CreatedDate']),
          parent: WorkItem.fields['System.Parent']
            ? {uid: String(WorkItem.fields['System.Parent']), source}
            : null,
          description: Utils.cleanAndTruncate(
            WorkItem.fields['System.Description']
          ),
          status,
          statusChangedAt: Utils.toDate(
            WorkItem.fields['Microsoft.VSTS.Common.StateChangeDate']
          ),
          updatedAt: Utils.toDate(WorkItem.fields['System.ChangedDate']),
          creator: WorkItem.fields['System.CreatedBy']?.['uniqueName']
            ? {
                uid: WorkItem.fields['System.CreatedBy']['uniqueName'],
                source,
              }
            : null,
          sprint: WorkItem.fields['System.IterationId']
            ? {uid: String(WorkItem.fields['System.IterationId']), source}
            : null,
          epic: WorkItem.fields['Faros']?.['EpicId']
            ? {uid: String(WorkItem.fields['Faros']['EpicId']), source}
            : null,
          priority: String(WorkItem.fields['Microsoft.VSTS.Common.Priority']),
          resolvedAt: Utils.toDate(
            WorkItem.fields['Microsoft.VSTS.Common.ResolvedDate']
          ),
          statusChangelog,
          additionalFields: WorkItem.additionalFields,
          resolutionStatus:
            WorkItem.fields['Microsoft.VSTS.Common.ResolvedReason'],
          points: WorkItem.fields['Microsoft.VSTS.Scheduling.StoryPoints'],
        },
      },
      {
        model: 'tms_TaskProjectRelationship',
        record: {
          task: taskKey,
          project: {uid: projectId, source},
        },
      },
      ...assignees,
      ...tags,
      ...taskBoard,
      ...sprintHistory,
      ...epic,
      ...this.convertTestRelationships(WorkItem, source),
    ];
  }

  private convertAreaPath(
    task: TaskKey,
    areaPath?: string
  ): ReadonlyArray<DestinationRecord> {
    if (!areaPath) {
      return [];
    }

    return [
      {
        model: 'tms_TaskBoardRelationship',
        record: {
          task,
          board: {uid: areaPath, source: this.source},
        },
      },
    ];
  }

  private collectAreaPath(areaPath: string, projectId: string): string {
    if (!areaPath || !projectId) {
      return;
    }

    const projectAreaPaths =
      this.projectAreaPaths.get(projectId) ?? new Set<string>();

    const trimmedPath = areaPath.trim();
    projectAreaPaths.add(trimmedPath);
    this.projectAreaPaths.set(projectId, projectAreaPaths);

    return trimmedPath;
  }

  private getTags(
    task: TaskKey,
    tags?: string
  ): ReadonlyArray<DestinationRecord> {
    if (!tags?.trim()) {
      return [];
    }

    return tags
      .split(';')
      .filter(Boolean)
      .map((tag) => ({
        model: 'tms_TaskTag',
        record: {
          task,
          label: {name: tag.trim()},
        },
      }));
  }

  private getTaskType(type: string): CategoryDetail {
    const mapping = {
      task: 'Task',
      bug: 'Bug',
      'user story': 'Story',
    };
    return {
      category: mapping[type.toLowerCase()] ?? 'Custom',
      detail: type,
    };
  }

  private getStatusMapping(state: {
    name: string;
    category: string;
  }): CategoryDetail {
    const statusMapping = {
      Proposed: 'Todo',
      InProgress: 'InProgress',
      Resolved: 'Done',
      Completed: 'Done',
      Removed: 'Done',
    };

    const {name, category} = state;
    return {
      category: statusMapping[category] ?? 'Custom',
      detail: name,
    };
  }

  private convertAssigneeRevisions(
    task: TaskKey,
    assigneeRevisions: ReadonlyArray<WorkItemAssigneeRevision>,
    logger?: AirbyteLogger
  ): ReadonlyArray<DestinationRecord> {
    return assigneeRevisions
      .map((revision) => {
        const uid = getUniqueName(revision.assignee);
        if (uid) {
          return {
            model: 'tms_TaskAssignment',
            record: {
              task,
              assignee: {uid: uid, source: this.source},
              assignedAt: Utils.toDate((revision as any).assignedAt),
              unassignedAt: Utils.toDate((revision as any).unassignedAt),
            },
          };
        } else {
          logger?.warn(
            `Missing assignee uniqueName in work item ${task.uid} revision. WorkItemId: ${task.uid}, Revision: ${JSON.stringify(revision)}`
          );
          return null;
        }
      })
      .filter(Boolean) as DestinationRecord[];
  }

  private convertStateRevisions(
    stateRevisions: ReadonlyArray<WorkItemStateRevision>
  ): TaskStatusChange[] {
    return stateRevisions.map((revision) => ({
      status: this.getStatusMapping(revision.state),
      changedAt: Utils.toDate(revision.changedDate),
    }));
  }

  private convertIterationRevisions(
    task: TaskKey,
    iterations: ReadonlyArray<WorkItemIterationRevision>,
    areaPath: string
  ): ReadonlyArray<DestinationRecord> {
    if (!iterations?.length) {
      return [];
    }

    return iterations.flatMap((revision) => {
      const sprint = {uid: String(revision.iteration), source: this.source};
      const records: DestinationRecord[] = [
        {
          model: 'tms_SprintHistory',
          record: {
            task,
            sprint,
            addedAt: Utils.toDate(revision.addedAt),
            removedAt: Utils.toDate(revision.removedAt),
          },
        },
      ];

      if (areaPath) {
        const iterationSet =
          this.areaPathIterations.get(areaPath) ?? new Set<string>();
        iterationSet.add(String(revision.iteration));
        this.areaPathIterations.set(areaPath, iterationSet);
      }

      return records;
    });
  }

  private getEpic(
    key: {uid: string; source: string},
    fields: {
      [key: string]: any;
    },
    status: CategoryDetail,
    projectId: string
  ): ReadonlyArray<DestinationRecord> {
    if (fields['System.WorkItemType'] !== 'Epic') {
      return [];
    }

    return [
      {
        model: 'tms_Epic',
        record: {
          ...key,
          name: fields['System.Title'],
          description: Utils.cleanAndTruncate(fields['System.Description']),
          createdAt: Utils.toDate(fields['System.CreatedDate']),
          updatedAt: Utils.toDate(fields['System.ChangedDate']),
          status,
          project: {uid: String(projectId), source: this.streamName.source},
        },
      },
    ];
  }

  async onProcessingComplete(): Promise<ReadonlyArray<DestinationRecord>> {
    return [
      ...this.processProjectAreaPaths(),
      ...this.processAreaPathIterations(),
      ...this.convertComments(),
    ];
  }

  private processProjectAreaPaths(): DestinationRecord[] {
    const records: DestinationRecord[] = [];
    const source = this.streamName.source;

    for (const [projectId, areaPaths] of this.projectAreaPaths.entries()) {
      for (const areaPath of areaPaths) {
        // Extract board name from Azure DevOps area path (format: "AreaLevel1\\AreaLevel2\\AreaLevel3")
        const pathParts = areaPath.split('\\');
        const boardName = pathParts.at(-1) ?? areaPath;

        const boardKey = {
          uid: areaPath,
          source,
        };

        // Create board record
        records.push({
          model: 'tms_TaskBoard',
          record: {
            ...boardKey,
            name: boardName,
          },
        });

        // Create board-project relationship record
        records.push({
          model: 'tms_TaskBoardProjectRelationship',
          record: {
            board: boardKey,
            project: {uid: projectId, source},
          },
        });
      }
    }

    return records;
  }

  private processAreaPathIterations(): DestinationRecord[] {
    return Array.from(this.areaPathIterations.entries()).flatMap(
      ([areaPath, iterations]) =>
        Array.from(iterations).map((iterationUid) => ({
          model: 'tms_SprintBoardRelationship',
          record: {
            sprint: {uid: String(iterationUid), source: this.source},
            board: {uid: areaPath, source: this.source},
          },
        }))
    );
  }

  private convertComments(): DestinationRecord[] {
    if (!this.fetchWorkItemComments) {
      return [];
    }
    return [
      // Delete existing comments for all processed work items
      ...Array.from(this.seenWorkItems.keys()).map((workItemId) => ({
        model: 'tms_TaskComment__Deletion',
        record: {
          flushRequired: false,
          where: {
            task: {uid: workItemId, source: this.source},
          },
        },
      })),
      FLUSH,
      // Insert all new comments
      ...this.workItemComments,
    ];
  }

  private convertTestCase(
    WorkItem: WorkItemWithRevisions,
    source: string
  ): ReadonlyArray<DestinationRecord> {
    const res: DestinationRecord[] = [];
    const uid = String(WorkItem.id);

    res.push({
      model: 'qa_TestCase',
      record: {
        uid,
        name: WorkItem.fields['System.Title'],
        description: Utils.cleanAndTruncate(
          WorkItem.fields['System.Description']
        ),
        source,
        type: {category: 'Manual', detail: 'manual'},
      },
    });

    res.push(...this.convertTestRelationships(WorkItem, source));
    return res;
  }

  private convertTestRelationships(
    WorkItem: WorkItemWithRevisions,
    source: string
  ): ReadonlyArray<DestinationRecord> {
    const res: DestinationRecord[] = [];
    const relations = (WorkItem as any).relations || [];
    const workItemUid = String(WorkItem.id);
    const workItemType = WorkItem.fields['System.WorkItemType'];

    for (const relation of relations) {
      if (!relation.rel || !relation.url) continue;

      const relatedWorkItemId = this.extractWorkItemIdFromUrl(relation.url);
      if (!relatedWorkItemId) continue;

      const relatedWorkItemUid = String(relatedWorkItemId);

      if (relation.rel === 'Microsoft.VSTS.Common.TestedBy-Forward') {
        if (workItemType === 'Test Case') {
          res.push({
            model: 'qa_TestCaseWorkItemAssociation',
            record: {
              testCase: {uid: workItemUid, source},
              workItem: {uid: relatedWorkItemUid, source},
            },
          });
        }
      } else if (relation.rel === 'Microsoft.VSTS.Common.TestedBy-Reverse') {
        if (workItemType !== 'Test Case') {
          res.push({
            model: 'qa_TestCaseWorkItemAssociation',
            record: {
              testCase: {uid: relatedWorkItemUid, source},
              workItem: {uid: workItemUid, source},
            },
          });
        }
      }
    }

    return res;
  }

  private extractWorkItemIdFromUrl(url: string): number | null {
    const match = url.match(/workItems\/(\d+)$/);
    return match ? parseInt(match[1], 10) : null;
  }
}
