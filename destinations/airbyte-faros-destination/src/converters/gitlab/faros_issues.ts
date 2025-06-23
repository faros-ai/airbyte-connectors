import {AirbyteRecord} from 'faros-airbyte-cdk';
import {FarosIssueOutput} from 'faros-airbyte-common/gitlab';
import {Utils} from 'faros-js-client';
import {toLower} from 'lodash';

import {DestinationModel, DestinationRecord} from '../converter';
import {GitlabCommon, GitlabConverter} from './common';

export class FarosIssues extends GitlabConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_Label',
    'tms_Task',
    'tms_TaskAssignment',
    'tms_TaskBoardRelationship',
    'tms_TaskProjectRelationship',
    'tms_TaskTag',
  ];

  id(record: AirbyteRecord): string {
    const issue = record?.record?.data as FarosIssueOutput;
    return String(issue?.id);
  }

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const issue = record.record.data as FarosIssueOutput;
    const res: DestinationRecord[] = [];

    if (!issue?.id) {
      return [];
    }

    const uid = String(issue.id);
    const taskKey = {uid, source: this.streamName.source};

    
    // Create project key from project_path and group_id
    const projectKey = {
      uid: `${toLower(issue.group_id)}/${toLower(issue.project_path)}`,
      source: this.streamName.source,
    };

    // Handle assignees
    issue.assignee_usernames?.forEach((username: string) => {
      if (username) {
        res.push({
          model: 'tms_TaskAssignment',
          record: {
            task: taskKey,
            assignee: {uid: username, source: this.streamName.source},
          },
        });
      }
    });

    // Handle labels
    issue.labels?.forEach((label) => {
      // Labels can be either string or SimpleLabelSchema
      const labelName = typeof label === 'string' ? label : label.name;
      if (labelName) {
        res.push({model: 'tms_Label', record: {name: labelName}});

        res.push({
          model: 'tms_TaskTag',
          record: {
            task: taskKey,
            label: {name: labelName},
          },
        });
      }
    });

    // Create the task record
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
        creator: issue.author_username
          ? {uid: issue.author_username, source: this.streamName.source}
          : null,
        createdAt: Utils.toDate(issue.created_at),
        updatedAt: Utils.toDate(issue.updated_at),
        source: this.streamName.source,
      },
    });

    // Link task to project
    res.push({
      model: 'tms_TaskProjectRelationship',
      record: {
        task: taskKey,
        project: projectKey,
      },
    });

    // Link task to board (at project level)
    res.push({
      model: 'tms_TaskBoardRelationship',
      record: {
        task: taskKey,
        board: projectKey,
      },
    });

    return res;
  }
}
