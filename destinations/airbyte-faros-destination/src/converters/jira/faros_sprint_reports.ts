import {AirbyteRecord} from 'faros-airbyte-cdk';
import {SprintReport} from 'faros-airbyte-common/jira';
import {toString} from 'lodash';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {JiraCommon, JiraConverter, JiraStatusCategories} from './common';

export class FarosSprintReports extends JiraConverter {
  get destinationModels(): ReadonlyArray<DestinationModel> {
    return ['tms_SprintReport'];
  }
  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const sprintReport = record.record.data as SprintReport;
    const sprintUid = toString(sprintReport.sprintId);
    const boardUid = toString(sprintReport.boardId);
    const results: DestinationRecord[] = [];
    const source = this.streamName.source;
    for (const issue of sprintReport.issues || []) {
      const status = issue.status
        ? {
            category: JiraStatusCategories.get(
              JiraCommon.normalize(issue.status.category)
            ),
            detail: issue.status.detail,
          }
        : undefined;
      results.push({
        model: 'tms_SprintReport',
        record: {
          sprintHistory: {
            task: {uid: issue.key, source},
            sprint: {uid: sprintUid, source},
          },
          board: {uid: boardUid, source},
          points: issue.points,
          plannedPoints: issue.plannedPoints,
          classification: {category: issue.classification},
          status,
          addedDuringSprint: issue.addedDuringSprint,
        },
      });
    }
    return results;
  }
}
