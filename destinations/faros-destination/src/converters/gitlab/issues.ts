import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {
  DestinationModel,
  DestinationRecord,
  StreamContext,
  StreamName,
} from '../converter';
import {GitlabCommon, GitlabConverter} from './common';

export class GitlabIssues extends GitlabConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_Label',
    'tms_Task',
    'tms_TaskAssignment',
    'tms_TaskBoardRelationship',
    'tms_TaskTag',
  ];

  private readonly usersStream = new StreamName('gitlab', 'users');

  override get dependencies(): ReadonlyArray<StreamName> {
    return [this.usersStream];
  }

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const issue = record.record.data;
    const res: DestinationRecord[] = [];

    const uid = String(issue.id);
    issue.assignees?.forEach((assignee: any) => {
      if (assignee) {
        const usersStream = this.usersStream.stringify();
        const user = ctx.get(usersStream, String(assignee));
        const username = user?.record?.data?.username;

        res.push({
          model: 'tms_TaskAssignment',
          record: {
            task: {uid, source},
            assignee: {uid: username, source},
          },
        });
      }
    });

    issue.labels.forEach((label: string) => {
      res.push({model: 'tms_Label', record: {name: label}});

      res.push({
        model: 'tms_TaskTag',
        record: {
          task: {uid, source},
          label: {name: label},
        },
      });
    });

    const category = issue.state === 'opened' ? 'Todo' : 'Done';
    res.push({
      model: 'tms_Task',
      record: {
        uid,
        name: issue.title,
        description: issue.description?.substring(
          0,
          GitlabCommon.MAX_DESCRIPTION_LENGTH
        ),
        status: {category, detail: issue.state},
        creator: issue.author_id ? {uid: issue.author_id, source} : undefined,
        createdAt: Utils.toDate(issue.created_at),
        updatedAt: Utils.toDate(issue.updated_at),
        source,
      },
    });

    const repository = GitlabCommon.parseRepositoryKey(issue.web_url, source);

    if (!repository) return res;

    // TODO: If tasks get transferred between repos or projects, delete previous relationship
    // (this should probably be done in here and in issue-events)
    res.push({
      model: 'tms_TaskBoardRelationship',
      record: {
        task: {uid, source},
        board: repository ? {uid: repository.name, source} : null,
      },
    });

    return res;
  }
}
