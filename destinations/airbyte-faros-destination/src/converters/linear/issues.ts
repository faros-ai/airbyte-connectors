import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {LinearCommon, LinearConverter} from './common';
import {Issue, TaskField, TaskStatusChange} from './models';

export class Issues extends LinearConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_Label',
    'tms_Task',
    'tms_TaskAssignment',
    'tms_TaskBoardRelationship',
    'tms_TaskDependency',
    'tms_TaskProjectRelationship',
    'tms_TaskTag',
  ];
  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const issue = record.record.data as Issue;
    const res: DestinationRecord[] = [];

    const maxDescriptionLength = this.maxDescriptionLength(ctx);

    const taskKey = {uid: String(issue.id), source};

    const statusChangelog: TaskStatusChange[] = [];

    const additionalFields: TaskField[] = [];

    let statusChangedAt: Date = undefined;
    for (const history of issue.history ?? []) {
      if (history.fromState) {
        if (!statusChangedAt) {
          statusChangedAt = Utils.toDate(history.createdAt);
        }
        statusChangelog.push({
          status: LinearCommon.getTaskStatus(history.toState.name),
          changedAt: Utils.toDate(history.createdAt),
        });
      }
    }
    if (issue.assignee) {
      res.push({
        model: 'tms_TaskAssignment',
        record: {
          task: taskKey,
          assignee: {uid: String(issue.assignee.id), source},
          assignedAt: Utils.toDate(issue.assignee.createdAt),
        },
      });
    }
    const status = LinearCommon.getTaskStatus(issue.state.name);
    res.push({
      model: 'tms_Task',
      record: {
        ...taskKey,
        name: issue.title,
        description: issue.description?.substring(0, maxDescriptionLength),
        priority: String(issue.priority),
        type: LinearCommon.getTaskType(issue.labels[0]),
        status,
        additionalFields,
        createdAt: Utils.toDate(issue.createdAt),
        updatedAt: Utils.toDate(issue.updatedAt),
        statusChangedAt,
        statusChangelog,
        parent: issue.parent
          ? {uid: String(issue.parent.id), source}
          : undefined,
        creator: issue.creator
          ? {uid: String(issue.creator.id), source}
          : undefined,
        sprint: issue.cycle ? {uid: String(issue.cycle.id), source} : undefined,
        epic: issue.project
          ? {uid: String(issue.project.id), source}
          : undefined,
      },
    });
    if (issue.project) {
      const projectRef = {uid: String(issue.project.id), source};
      res.push({
        model: 'tms_TaskProjectRelationship',
        record: {
          task: taskKey,
          project: projectRef,
        },
      });
      res.push({
        model: 'tms_TaskBoardRelationship',
        record: {
          task: taskKey,
          board: projectRef,
        },
      });
    }
    if (issue.parent) {
      res.push({
        model: 'tms_TaskDependency',
        record: {
          dependentTask: {uid: String(issue.parent.id), source},
          fulfillingTask: {uid: String(issue.id), source},
          blocking: false,
        },
      });
    }
    return res;
  }
}
