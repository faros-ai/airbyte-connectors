import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Issue, IssueAssignment} from 'faros-airbyte-common/github';
import {Utils} from 'faros-js-client';
import {toLower, toString} from 'lodash';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GitHubConverter, PartialUser} from './common';

type AssigneeEvent = {
  assignee: PartialUser;
  createdAt: string;
  isAssigned: boolean;
};

export class FarosIssues extends GitHubConverter {
  private collectedLabels = new Set<string>();
  private collectedTmsUsers = new Map<string, PartialUser>();

  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_Label',
    'tms_Task',
    'tms_TaskAssignment',
    'tms_TaskBoardRelationship',
    'tms_TaskProjectRelationship',
    'tms_TaskTag',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const records: DestinationRecord[] = [];
    const issue = record.record.data as Issue;
    const source = this.streamName.source;
    const taskKey = {
      uid: toString(issue.databaseId),
      source,
    };

    this.collectUser(issue.author);

    for (const assignment of issue.assignments.nodes || []) {
      const assigneeEvent = this.getAssigneeEvent(assignment);
      if (!assigneeEvent) continue;

      const {assignee, createdAt, isAssigned} = assigneeEvent;

      if (isAssigned) {
        records.push({
          model: 'tms_TaskAssignment',
          record: {
            task: taskKey,
            assignee: {uid: assignee.login, source},
            assignedAt: createdAt,
          },
        });
        this.collectUser(assignee);
      } else {
        records.push({
          model: 'tms_TaskAssignment__Deletion',
          record: {
            where: {
              task: taskKey,
              assignee: {uid: assignee.login, source},
            },
          },
        });
      }
    }

    for (const {name} of issue.labels?.nodes ?? []) {
      this.collectedLabels.add(name);
      records.push({
        model: 'tms_TaskTag',
        record: {
          task: taskKey,
          label: {name},
        },
      });
    }

    const state = toLower(issue.state);
    const category = state === 'open' ? 'Todo' : 'Done';
    const createdAt = Utils.toDate(issue.createdAt);
    const closedAt = Utils.toDate(issue.closedAt);
    const statusChangelog = [
      {
        changedAt: createdAt,
        status: {category: 'Todo', detail: 'open'},
      },
    ];
    if (category === 'Done' && closedAt) {
      statusChangelog.push({
        changedAt: closedAt,
        status: {category, detail: state},
      });
    }
    records.push({
      model: 'tms_Task',
      record: {
        ...taskKey,
        name: issue.title,
        description: Utils.cleanAndTruncate(issue.bodyText),
        status: {category, detail: state},
        statusChangelog,
        createdAt,
        updatedAt: Utils.toDate(issue.updatedAt),
        creator: issue.author?.login
          ? {uid: issue.author.login, source}
          : undefined,
      },
    });

    // TODO: If tasks get transferred between repos or projects, delete previous relationship
    const projectOrBoardKey = {uid: `${issue.org}/${issue.repo}`, source};
    records.push(
      ...[
        {
          model: 'tms_TaskBoardRelationship',
          record: {
            task: taskKey,
            board: projectOrBoardKey,
          },
        },
        {
          model: 'tms_TaskProjectRelationship',
          record: {
            task: taskKey,
            project: projectOrBoardKey,
          },
        },
      ]
    );

    return records;
  }

  private getAssigneeEvent(assignment: IssueAssignment): AssigneeEvent {
    if (
      assignment.type !== 'AssignedEvent' &&
      assignment.type !== 'UnassignedEvent'
    ) {
      return null;
    }
    const assignee = assignment.assignee;
    if (!assignee.login) return null;
    return {
      assignee,
      createdAt: assignment.createdAt,
      isAssigned: assignment.type === 'AssignedEvent',
    };
  }

  private convertLabels(): ReadonlyArray<DestinationRecord> {
    const res: DestinationRecord[] = [];
    for (const label of this.collectedLabels) {
      res.push({
        model: 'tms_Label',
        record: {tms_Label: {name: label}},
      });
    }
    return res;
  }

  async onProcessingComplete(): Promise<ReadonlyArray<DestinationRecord>> {
    return [...this.convertTMSUsers(), ...this.convertLabels()];
  }
}
