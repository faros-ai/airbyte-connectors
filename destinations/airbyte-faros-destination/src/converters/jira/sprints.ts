import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';
import {
  camelCase,
  groupBy,
  invertBy,
  mapValues,
  pickBy,
  upperFirst,
} from 'lodash';
import {Dictionary} from 'ts-essentials';

import {
  DestinationModel,
  DestinationRecord,
  StreamContext,
  StreamName,
} from '../converter';
import {JiraCommon, JiraConverter, SprintIssue} from './common';

export class Sprints extends JiraConverter {
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
    return [Sprints.issueFieldsStream, Sprints.sprintIssuesStream];
  }

  private static getFieldIdsByName(ctx: StreamContext): Dictionary<string[]> {
    const records = ctx.getAll(Sprints.issueFieldsStream.asString);
    return invertBy(
      pickBy(
        mapValues(records, (r) => r.record.data.name as string),
        (name) => JiraCommon.POINTS_FIELD_NAMES.includes(name)
      )
    );
  }

  private static getSprintIssueRecords(
    ctx: StreamContext
  ): Dictionary<SprintIssue[], number> {
    const records = ctx.getAll(Sprints.sprintIssuesStream.asString);
    return groupBy(
      Object.values(records).map((r) => r.record.data as SprintIssue),
      (si) => si.sprintId
    );
  }

  private getPoints(issue: SprintIssue, ctx: StreamContext): number {
    let points = 0;
    for (const fieldName of JiraCommon.POINTS_FIELD_NAMES) {
      const fieldIds = this.pointsFieldIdsByName[fieldName] ?? [];
      for (const fieldId of fieldIds) {
        const pointsString = issue.fields[fieldId];
        if (!pointsString) continue;
        try {
          points = Utils.parseFloatFixedPoint(pointsString);
        } catch (err: any) {
          ctx.logger.warn(
            `Failed to get story points for issue ${issue.key}: ${err.message}`
          );
        }
        return points;
      }
    }
    return points;
  }

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const sprint = record.record.data;
    const source = this.initializeSource(ctx);
    if (!this.pointsFieldIdsByName) {
      this.pointsFieldIdsByName = Sprints.getFieldIdsByName(ctx);
    }
    if (!this.sprintIssueRecords) {
      this.sprintIssueRecords = Sprints.getSprintIssueRecords(ctx);
    }

    let completedPoints = 0;
    for (const issue of this.sprintIssueRecords[sprint.id] ?? []) {
      const status = issue.fields.status?.statusCategory?.name;
      if (status && JiraCommon.normalize(status) === 'done') {
        completedPoints += this.getPoints(issue, ctx);
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
          source,
        },
      },
    ];
  }
}
