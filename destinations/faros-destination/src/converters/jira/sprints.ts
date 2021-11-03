import {AirbyteLogger, AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';
import {camelCase, upperFirst} from 'lodash';
import {Dictionary} from 'ts-essentials';

import {
  DestinationModel,
  DestinationRecord,
  StreamContext,
  StreamName,
} from '../converter';
import {JiraCommon, JiraConverter, SprintIssue} from './common';

export class JiraSprints extends JiraConverter {
  private logger = new AirbyteLogger();

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
  private sprintIssueRecords?: Dictionary<SprintIssue[], number>;

  override get dependencies(): ReadonlyArray<StreamName> {
    return [JiraSprints.issueFieldsStream, JiraSprints.sprintIssuesStream];
  }

  private static getFieldIdsByName(ctx: StreamContext): Dictionary<string[]> {
    const records = ctx.getAll(JiraSprints.issueFieldsStream.asString) ?? {};
    const results: Dictionary<string[]> = {};
    for (const [id, record] of Object.entries(records)) {
      const name = record.record?.data?.name;
      if (!JiraCommon.POINTS_FIELD_NAMES.includes(name)) continue;
      if (!(name in results)) {
        results[name] = [];
      }
      results[name].push(id);
    }
    return results;
  }

  private static getSprintIssueRecords(
    ctx: StreamContext
  ): Dictionary<SprintIssue[], number> {
    const records = ctx.getAll(JiraSprints.sprintIssuesStream.asString) ?? {};
    const results: Dictionary<SprintIssue[], number> = {};
    for (const record of Object.values(records)) {
      const sprintId = record.record?.data?.sprintId;
      if (!sprintId) continue;
      if (!(sprintId in results)) {
        results[sprintId] = [];
      }
      results[sprintId].push(record.record.data as SprintIssue);
    }
    return results;
  }

  private getPoints(issue: SprintIssue): number {
    let points = 0;
    for (const fieldName of JiraCommon.POINTS_FIELD_NAMES) {
      const fieldIds = this.pointsFieldIdsByName[fieldName] ?? [];
      for (const fieldId of fieldIds) {
        const pointsString = issue.fields[fieldId];
        if (!pointsString) continue;
        try {
          points = Utils.parseFloatFixedPoint(pointsString);
        } catch (err: any) {
          this.logger.warn(
            `Failed to get story points for issue ${issue.key}: ${err.message}`
          );
        }
        return points;
      }
    }
    return points;
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

    let completedPoints = 0;
    for (const issue of this.sprintIssueRecords[sprint.id] ?? []) {
      const status = issue.fields.status?.statusCategory?.name;
      if (status && JiraCommon.normalize(status) === 'done') {
        completedPoints += this.getPoints(issue);
      }
    }

    return [
      {
        model: 'tms_Sprint',
        record: {
          uid: String(sprint.id),
          name: sprint.name,
          state: upperFirst(camelCase(sprint.state)),
          completedPoints,
          startedAt: Utils.toDate(sprint.startDate),
          endedAt: Utils.toDate(sprint.endDate),
          source: this.streamName.source,
        },
      },
    ];
  }
}
