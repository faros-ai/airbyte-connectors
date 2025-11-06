import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {
  DestinationModel,
  DestinationRecord,
  StreamContext,
  StreamName,
} from '../converter';
import {GitlabCommon, GitlabConverter} from './common';

export class Issues extends GitlabConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_Label',
    'tms_Task',
    'tms_TaskAssignment',
    'tms_TaskBoardRelationship',
    'tms_TaskProjectRelationship',
    'tms_TaskTag',
  ];

  private readonly usersStream = new StreamName('gitlab', 'users');

  override get dependencies(): ReadonlyArray<StreamName> {
    return [this.usersStream];
  }

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const issue = record.record.data;
    const res: DestinationRecord[] = [];
    const usersStream = this.usersStream.asString;

    const uid = String(issue.id);
    const taskKey = {uid, source};
    const repository = GitlabCommon.parseRepositoryKey(issue.web_url, source);
    const projectRef = {uid: repository.uid, source};

    issue.assignees?.forEach((assignee: any) => {
      if (assignee) {
        const assigneeUser = ctx.get(usersStream, String(assignee));
        const assigneeUsername = assigneeUser?.record?.data?.username;

        if (assigneeUsername) {
          res.push({
            model: 'tms_TaskAssignment',
            record: {
              task: {uid, source},
              assignee: {uid: assigneeUsername, source},
            },
          });
        } else {
          ctx.logger.warn(
            `Could not find assignee ${assignee} from for record ${uid}`
          );
        }
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

    const user = ctx.get(usersStream, String(issue.author_id));
    const username = user?.record?.data?.username;

    const category = issue.state === 'opened' ? 'Todo' : 'Done';
    res.push({
      model: 'tms_Task',
      record: {
        uid,
        name: issue.title,
        description: Utils.cleanAndTruncate(
          issue.description,
          GitlabCommon.MAX_DESCRIPTION_LENGTH
        ),
        status: {category, detail: issue.state},
        points: issue.weight ?? undefined,
        creator: username ? {uid: username, source} : null,
        createdAt: Utils.toDate(issue.created_at),
        updatedAt: Utils.toDate(issue.updated_at),
        url: issue.web_url,
        // TODO: Link epics using either milestone or the first class epics in Gitlab Premium/Ultimate
        source,
      },
    });

    res.push({
      model: 'tms_TaskProjectRelationship',
      record: {
        task: taskKey,
        project: projectRef,
      },
    });

    res.push(
      ...GitlabCommon.mapRepositoryHierarchy<DestinationRecord>(
        repository,
        (k) => {
          return {
            model: 'tms_TaskBoardRelationship',
            record: {
              task: taskKey,
              board: k,
            },
          };
        }
      )
    );
    return res;
  }
}
