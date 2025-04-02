import {AirbyteRecord} from 'faros-airbyte-cdk';
import {
  WorkItemAssigneeRevision,
  WorkItemIterationRevision,
  WorkItemStateRevision,
  WorkItemWithRevisions,
} from 'faros-airbyte-common/azure-devops';
import {Utils} from 'faros-js-client';

import {CategoryDetail} from '../common/common';
import {DestinationModel, DestinationRecord} from '../converter';
import {AzureWorkitemsConverter} from './common';
import {TaskKey, TaskStatusChange} from './models';
export class Workitems extends AzureWorkitemsConverter {
  private readonly projectAreaPaths = new Map<string, Set<string>>();
  private readonly areaPathIterations = new Map<string, Set<string>>();

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
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.source;
    const WorkItem = record.record.data as WorkItemWithRevisions;
    const taskKey = {uid: String(WorkItem.id), source};

    const areaPath = this.collectAreaPath(
      WorkItem.fields['System.AreaPath'],
      WorkItem.projectId
    );
    const taskBoard = this.convertAreaPath(taskKey, areaPath);
    const statusChangelog = this.convertStateRevisions(
      WorkItem.revisions.states
    );
    const assignees = this.convertAssigneeRevisions(
      taskKey,
      WorkItem.revisions.assignees
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

    const epic = this.getEpic(
      taskKey,
      WorkItem.fields,
      status,
      WorkItem.projectId
    );

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
          creator: {
            uid: WorkItem.fields['System.CreatedBy']['uniqueName'],
            source,
          },
          sprint: WorkItem.fields['System.IterationId']
            ? {uid: String(WorkItem.fields['System.IterationId']), source}
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
          project: {uid: String(WorkItem.projectId), source},
        },
      },
      ...assignees,
      ...tags,
      ...taskBoard,
      ...sprintHistory,
      ...epic,
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
    assigneeRevisions: ReadonlyArray<WorkItemAssigneeRevision>
  ): ReadonlyArray<DestinationRecord> {
    return assigneeRevisions.map((revision) => ({
      model: 'tms_TaskAssignment',
      record: {
        task,
        assignee: {uid: revision.assignee?.uniqueName, source: this.source},
        assignedAt: Utils.toDate(revision.changedDate),
      },
    }));
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
}
