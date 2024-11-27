import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord} from '../converter';
import {AzureWorkitemsConverter} from './common';
import {
  AssigneeChange,
  CategoryDetail,
  TaskStatusChange,
  WorkItem,
} from './models';

export class Workitems extends AzureWorkitemsConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_Task',
    'tms_TaskAssignment',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const WorkItem = record.record.data as WorkItem;
    const taskKey = {uid: String(WorkItem.id), source};

    const statusChangelog = this.convertStateRevisions(
      WorkItem.revisions.states
    );
    const assignees = this.convertAssigneeRevisions(
      WorkItem.revisions.assignees
    );
    const {name: stateName, category: stateCategory} =
      WorkItem.fields['Faros']['WorkItemStateCategory'];

    const tags = this.getTags(WorkItem.fields['System.Tags']);
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
          status: this.getStatusMapping(stateName, stateCategory),
          statusChangedAt: Utils.toDate(
            WorkItem.fields['Microsoft.VSTS.Common.StateChangeDate']
          ),
          updatedAt: Utils.toDate(WorkItem.fields['System.ChangedDate']),
          creator: {
            uid: WorkItem.fields['System.CreatedBy']['uniqueName'],
            source,
          },
          sprint: {uid: String(WorkItem.fields['System.IterationId']), source},
          priority: String(WorkItem.fields['Microsoft.VSTS.Common.Priority']),
          resolvedAt: Utils.toDate(
            WorkItem.fields['Microsoft.VSTS.Common.ResolvedDate']
          ),
          statusChangelog,
          additionalFields,
          // TODO - Add
          // Microsoft.VSTS.Common.ResolvedReason
          // Microsoft.VSTS.Scheduling.Effort
        },
      },
      ...assignees.map((assignee) => ({
        model: 'tms_TaskAssignment',
        record: {
          task: taskKey,
          assignee: {uid: assignee.assignee, source},
          assignedAt: assignee.changedAt,
        },
      })),
      {
        model: 'tms_TaskProjectRelationship',
        record: {
          task: taskKey,
          project: {uid: String(WorkItem.projectId), source},
        },
      },
      ...tags.map((tag) => ({
        model: 'tms_TaskTag',
        record: {task: taskKey, label: {name: tag}},
      })),
      // TODO - Add sprintHistory
    ];
  }

  private getTags(tags: string): string[] {
    return tags.split(';').map((tag) => tag.trim());
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

  private getStatusMapping(name: string, category: string): CategoryDetail {
    const statusMapping = {
      Proposed: 'Todo',
      InProgress: 'InProgress',
      Resolved: 'Done',
      Completed: 'Done',
      Removed: 'Done',
    };
    return {
      category: statusMapping[category] ?? 'Custom',
      detail: name,
    };
  }

  private convertAssigneeRevisions(assigneeRevisions: any[]): AssigneeChange[] {
    return assigneeRevisions.map((revision) => ({
      assignee: revision.assignee?.uniqueName,
      changedAt: Utils.toDate(revision.changedDate),
    }));
  }

  private convertStateRevisions(stateRevisions: any[]): TaskStatusChange[] {
    return stateRevisions.map((revision) => ({
      status: this.getStatusMapping(
        revision.state.name,
        revision.state.category
      ),
      changedAt: Utils.toDate(revision.changedDate),
    }));
  }
}
