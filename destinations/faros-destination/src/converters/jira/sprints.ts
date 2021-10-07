import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk/lib';
import {flatten} from 'lodash';
import {Dictionary} from 'ts-essentials';

import {
  DestinationModel,
  DestinationRecord,
  StreamContext,
  StreamName,
} from '../converter';
import {JiraCommon, JiraConverter} from './common';

export class JiraSprints extends JiraConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_Sprint'];

  private static readonly issueFieldsStream = new StreamName(
    'jira',
    'issue_fields'
  );
  private static readonly sprintIssuesStream = new StreamName(
    'jira',
    'sprint_issues'
  );

  private pointsFieldIdsByName?: Dictionary<string[]>;
  private sprintIssueRecords?: Dictionary<AirbyteRecord[], number>;

  override get dependencies(): ReadonlyArray<StreamName> {
    return [JiraSprints.issueFieldsStream, JiraSprints.sprintIssuesStream];
  }

  private static getFieldIdsByName(ctx: StreamContext): Dictionary<string[]> {
    const records = ctx.records(JiraSprints.issueFieldsStream.stringify());
    const results: Dictionary<string[]> = {};
    for (const [id, recs] of Object.entries(records)) {
      for (const rec of recs) {
        const name = rec.record?.data?.name;
        if (!name) continue;
        if (!(name in results)) {
          results[name] = [];
        }
        results[name].push(id);
      }
    }
    return results;
  }

  private static getSprintIssueRecords(
    ctx: StreamContext
  ): Dictionary<AirbyteRecord[], number> {
    const records = ctx.records(JiraSprints.sprintIssuesStream.stringify());
    const results: Dictionary<AirbyteRecord[], number> = {};
    for (const record of flatten(Object.values(records))) {
      const sprintId = record.record?.data?.sprintId;
      if (!sprintId) continue;
      if (!(sprintId in results)) {
        results[sprintId] = [];
      }
      results[sprintId].push(record);
    }
    return results;
  }

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const sprint = record.record.data;
    if (!this.pointsFieldIdsByName) {
      this.pointsFieldIdsByName = JiraSprints.getFieldIdsByName(ctx);
    }
    if (!this.sprintIssueRecords) {
      this.sprintIssueRecords = JiraSprints.getSprintIssueRecords(ctx);
    }

    return [
      {
        model: 'tms_Sprint',
        record: {
          uid: String(sprint.id),
          name: sprint.name,
          state: JiraCommon.upperCamelCase(sprint.state),
          completedPoints: 0.0,
          startedAt: Utils.toDate(sprint.startDate),
          endedAt: Utils.toDate(sprint.endDate),
          source: this.streamName.source,
        },
      },
    ];
  }
}
