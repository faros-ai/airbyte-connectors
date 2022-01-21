import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {BacklogCommon, BacklogConverter} from './common';
import {Issue, TaskField, TaskStatusChange} from './models';
export class BacklogIssues extends BacklogConverter {
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
    const taskKey = {uid: String(issue.id), source};

    const statusChangelog: TaskStatusChange[] = [];

    const additionalFields: TaskField[] = [];

    let statusChangedAt: Date = undefined;
    for (const label of issue.milestone) {
      const labelRef = {name: label.name};
      res.push({
        model: 'tms_TaskTag',
        record: {
          label: labelRef,
          task: taskKey,
        },
      });
      res.push({
        model: 'tms_Label',
        record: labelRef,
      });
    }
    for (const label of issue.versions) {
      const labelRef = {name: label.name};
      res.push({
        model: 'tms_TaskTag',
        record: {
          label: labelRef,
          task: taskKey,
        },
      });
      res.push({
        model: 'tms_Label',
        record: labelRef,
      });
    }
    for (const comment of issue.comments ?? []) {
      for (const changeLog of comment.changeLog ?? []) {
        if (changeLog.field === 'status' && changeLog.newValue) {
          if (!statusChangedAt) {
            statusChangedAt = Utils.toDate(comment.created);
          }
          statusChangelog.push({
            status: BacklogCommon.getTaskStatus(changeLog.newValue),
            changedAt: Utils.toDate(comment.created),
          });
        } else if (changeLog.field === 'assigner' && changeLog.newValue) {
          let assignUserId = 0;
          for (const notification of comment.notifications ?? []) {
            if (notification.user.name === changeLog.newValue) {
              assignUserId = notification.user.id;
              break;
            }
          }
          res.push({
            model: 'tms_TaskAssignment',
            record: {
              task: taskKey,
              assignee: {uid: String(assignUserId), source},
              assignedAt: Utils.toDate(comment.created),
            },
          });
        }
      }
    }
    for (const additionalField of issue.customFields ?? []) {
      additionalFields.push({
        name: additionalField.name,
        value: additionalField.value,
      });
    }
    res.push({
      model: 'tms_Task',
      record: {
        ...taskKey,
        name: issue.summary,
        description: issue.description?.substring(
          0,
          BacklogCommon.MAX_DESCRIPTION_LENGTH
        ),
        priority: issue.priority?.name,
        type: BacklogCommon.getTaskType(issue.issueType),
        status: {
          category: BacklogCommon.getTaskStatus(issue.status.name),
        },
        points: 0,
        additionalFields,
        createdAt: Utils.toDate(issue.created),
        updatedAt: Utils.toDate(issue.updated),
        statusChangedAt,
        statusChangelog,
        parent: issue.parentIssueId
          ? {uid: String(issue.parentIssueId), source}
          : undefined,
        creator: issue.createdUser
          ? {uid: String(issue.createdUser.id), source}
          : undefined,
        // epic: issue.epic_id ? {uid: String(issue.epic_id), source} : undefined,
        // sprint: issue.iteration_id
        //   ? {uid: String(issue.iteration_id), source}
        //   : undefined,
      },
    });
    const projectRef = {uid: String(issue.projectId), source};
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
    if (issue.parentIssueId) {
      res.push({
        model: 'tms_TaskDependency',
        record: {
          dependentTask: {uid: String(issue.parentIssueId), source},
          fulfillingTask: {uid: String(issue.id), source},
          blocking: false,
        },
      });
    }
    return res;
  }
}
