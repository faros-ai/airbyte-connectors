import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {
  DestinationModel,
  DestinationRecord,
  StreamContext,
  StreamName,
} from '../converter';
import {BitbucketCommon, BitbucketConverter} from './common';
import {Issue, User} from './types';

enum TaskCategory {
  BUG = 'Bug',
  CUSTOM = 'Custom',
  STORY = 'Story',
  TASK = 'Task',
}

enum TaskStatusCategory {
  CUSTOM = 'Custom',
  DONE = 'Done',
  IN_PROGRESS = 'InProgress',
  TODO = 'Todo',
}

export class Issues extends BitbucketConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_Task',
    'tms_TaskAssignment',
    'tms_TaskProjectRelationship',
    'tms_TaskBoardRelationship',
    'tms_User',
  ];

  private readonly workspacesStream = new StreamName('bitbucket', 'workspace');

  override get dependencies(): ReadonlyArray<StreamName> {
    return [this.workspacesStream];
  }

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const issue = record.record.data as Issue;
    const res: DestinationRecord[] = [];

    const taskRef = {uid: String(issue.id), source};
    let creator = null;
    if (issue?.reporter?.accountId) {
      creator = {uid: issue.reporter.accountId, source};
      res.push(this.tmsUser(issue.reporter, source));
    }
    if (issue?.assignee?.accountId) {
      res.push(this.tmsUser(issue.assignee, source));
      res.push({
        model: 'tms_TaskAssignment',
        record: {
          task: taskRef,
          assignee: {uid: issue.assignee.accountId, source},
        },
      });
    }
    const projectRef = {uid: String(issue.repository.name), source};
    res.push({
      model: 'tms_TaskProjectRelationship',
      record: {
        task: taskRef,
        project: projectRef,
      },
    });
    res.push({
      model: 'tms_TaskBoardRelationship',
      record: {
        task: taskRef,
        board: projectRef,
      },
    });

    res.push({
      model: 'tms_Task',
      record: {
        ...taskRef,
        name: issue.title,
        description: issue.content?.raw?.substring(
          0,
          BitbucketCommon.MAX_DESCRIPTION_LENGTH
        ),
        type: this.toTaskType(issue.kind),
        status: this.toTaskStatus(issue.state),
        priority: issue.priority,
        createdAt: Utils.toDate(issue.createdOn),
        updatedAt: Utils.toDate(issue.updatedOn),
        creator,
      },
    });

    return res;
  }

  private tmsUser(user: User, source: string): DestinationRecord {
    return {
      model: 'tms_User',
      record: {
        uid: user.accountId?.toLowerCase(),
        name: user.nickname,
        source,
      },
    };
  }

  private toTaskType(type: string): {category: string; detail: string} {
    const typeLower = type?.toLowerCase();
    switch (typeLower) {
      case 'bug':
        return {category: TaskCategory.BUG, detail: typeLower};
      case 'task':
        return {category: TaskCategory.TASK, detail: typeLower};
      default:
        return {category: TaskCategory.CUSTOM, detail: typeLower};
    }
  }

  private toTaskStatus(status: string): {category: string; detail: string} {
    const statusLower = status?.toLowerCase();
    switch (statusLower) {
      case 'new':
      case 'open':
      case 'on hold':
      case 'wontfix':
        return {category: TaskStatusCategory.TODO, detail: statusLower};
      case 'resolved':
      case 'closed':
        return {category: TaskStatusCategory.DONE, detail: statusLower};
      case 'duplicate':
      case 'invalid':
      default:
        return {category: TaskStatusCategory.CUSTOM, detail: statusLower};
    }
  }
}
