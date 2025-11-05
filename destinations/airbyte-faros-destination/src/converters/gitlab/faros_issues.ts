import {AirbyteRecord} from 'faros-airbyte-cdk';
import {FarosIssueOutput, IssueStateEvent} from 'faros-airbyte-common/gitlab';
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

    const createdAt = Utils.toDate(issue.created_at);
    const closedAt = Utils.toDate(issue.closed_at);

    // Build status changelog from state events
    const statusChangelog = this.buildStatusChangelog(
      issue,
      issue.state_events || [],
      createdAt,
      closedAt
    );

    // Get the latest status change timestamp
    const statusChangedAt =
      statusChangelog.length > 0
        ? statusChangelog[statusChangelog.length - 1].changedAt
        : createdAt;

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
    const type = this.mapIssueType(issue.issue_type as string | undefined);
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
        statusChangelog,
        statusChangedAt,
        type,
        url: issue.web_url,
        creator: issue.author_username
          ? {uid: issue.author_username, source: this.streamName.source}
          : null,
        createdAt,
        updatedAt: Utils.toDate(issue.updated_at),
        source: this.streamName.source,
        ...(issue.epic?.id && {
          epic: {uid: `${issue.epic.id}`, source: this.streamName.source},
        }),
        ...(issue.iteration?.id && {
          sprint: {
            uid: `${issue.iteration.id}`,
            source: this.streamName.source,
          },
        }),
      },
    });

    // Link task to project (at group level)
    res.push({
      model: 'tms_TaskProjectRelationship',
      record: {
        task: taskKey,
        project: {
          uid: `${toLower(issue.group_id)}`,
          source: this.streamName.source,
        },
      },
    });

    // Link task to board (at project level)
    res.push({
      model: 'tms_TaskBoardRelationship',
      record: {
        task: taskKey,
        board: {
          uid: `${toLower(issue.group_id)}/${toLower(issue.project_path)}`,
          source: this.streamName.source,
        },
      },
    });

    return res;
  }

  private mapIssueType(issueType?: string): {
    category: string;
    detail: string;
  } {
    switch (toLower(issueType)) {
      case 'issue':
        return {category: 'Story', detail: issueType};
      case 'task':
        return {category: 'Task', detail: issueType};
      case 'incident':
      case 'test_case':
      default:
        return {category: 'Custom', detail: issueType};
    }
  }

  private buildStatusChangelog(
    issue: FarosIssueOutput,
    stateEvents: IssueStateEvent[],
    createdAt: Date,
    closedAt: Date
  ): Array<{
    changedAt: Date;
    status: {category: string; detail: string};
  }> {
    const changelog: Array<{
      changedAt: Date;
      status: {category: string; detail: string};
    }> = [];

    // Always start with the creation event
    changelog.push({
      changedAt: createdAt,
      status: {category: 'Todo', detail: 'opened'},
    });

    // Process state events to capture reopened/closed transitions
    for (const event of stateEvents) {
      const eventDate = Utils.toDate(event.created_at);
      if (!eventDate) continue;

      if (event.state === 'closed') {
        changelog.push({
          changedAt: eventDate,
          status: {category: 'Done', detail: 'closed'},
        });
      } else if (event.state === 'reopened') {
        changelog.push({
          changedAt: eventDate,
          status: {category: 'Todo', detail: 'reopened'},
        });
      }
    }

    // If no state events captured the final closed state, add it
    if (
      issue.state === 'closed' &&
      closedAt &&
      changelog.at(-1).status.detail !== 'closed'
    ) {
      changelog.push({
        changedAt: closedAt,
        status: {category: 'Done', detail: 'closed'},
      });
    }

    // Sort by date to ensure chronological order
    return changelog.sort(
      (a, b) => a.changedAt.getTime() - b.changedAt.getTime()
    );
  }
}
