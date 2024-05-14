import {AirbyteRecord} from 'faros-airbyte-cdk';
import {SprintReport} from 'faros-airbyte-common/lib/jira';
import {toString} from 'lodash';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {JiraConverter} from './common';

export class FarosSprintReports extends JiraConverter {
  get destinationModels(): ReadonlyArray<DestinationModel> {
    return ['tms_SprintHistory'];
  }
  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const sprintReport = record.record.data as SprintReport;
    const uid = toString(sprintReport.sprintId);
    const results: DestinationRecord[] = [];
    const source = this.streamName.source;
    for (const issue of sprintReport.issues || []) {
      results.push({
        model: 'tms_SprintHistory',
        record: {
          sprint: {uid, source},
          task: {uid: issue.key, source},
          points: issue.points,
          status: {category: issue.status},
          addedDuringSprint: issue.addedDuringSprint,
        },
      });
    }
    return results;
  }
}
