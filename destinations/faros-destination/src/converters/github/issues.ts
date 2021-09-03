import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {Converter, DestinationModel, DestinationRecord} from '../converter';
import {GithubCommon} from './common';

export class GithubIssues extends Converter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_Label',
    'tms_Task',
    'tms_TaskAssignment',
    'tms_TaskBoardRelationship',
    'tms_TaskTag',
    'tms_User',
  ];

  convert(record: AirbyteRecord): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const issue = record.record.data;
    const res: DestinationRecord[] = [];
    const uid = '' + issue.id;

    // GitHub's REST API v3 considers every pull request an issue,
    // but not every issue is a pull request. Will skip pull requests
    // since we pull them separately
    if (issue.pull_request) {
      return res;
    }

    if (issue.user) {
      res.push(GithubCommon.tms_User(issue.user, source));
    }

    issue.assignees?.forEach((a) => {
      if (a) {
        res.push(GithubCommon.tms_User(a, source));
        res.push({
          model: 'tms_TaskAssignment',
          record: {
            task: {uid, source},
            // TODO: change user uid to login once it's available
            assignee: {uid: `${a.id}`, source},
          },
        });
      }
    });

    issue.labels.forEach((l) => {
      res.push({
        model: 'tms_Label',
        record: {name: l.name},
      });
      res.push({
        model: 'tms_TaskTag',
        record: {
          task: {uid, source},
          label: {name: l.name},
        },
      });
    });

    // Github issues only have state either open or closed
    const category = issue.state === 'open' ? 'Todo' : 'Done';
    res.push({
      model: 'tms_Task',
      record: {
        uid,
        name: issue.title,
        description: issue.body?.substring(
          0,
          GithubCommon.MAX_DESCRIPTION_LENGTH
        ),
        status: {category, detail: issue.state},
        createdAt: Utils.toDate(issue.created_at),
        updatedAt: Utils.toDate(issue.updated_at),
        // TODO: change user uid to login once it's available
        creator: issue.user ? {uid: `${issue.user.id}`, source} : undefined,
        source,
      },
    });

    // TODO: If tasks get transferred between repos or projects, delete previous relationship
    // (this should probably be done in here and in issue-events)
    res.push({
      model: 'tms_TaskBoardRelationship',
      record: {
        task: {uid, source},
        board: {uid: issue.repository, source},
      },
    });

    return res;
  }
}
