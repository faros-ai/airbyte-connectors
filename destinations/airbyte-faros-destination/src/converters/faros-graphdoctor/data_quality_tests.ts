import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {Common} from '../common/common';
import {
  Converter,
  DestinationModel,
  DestinationRecord,
  StreamContext,
} from '../converter';
import {DataQualityIssue, SummaryKey} from './models';

export class DataQualityTest extends Converter {
  source = 'DataQualityTest';

  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'faros_DataQualityIssue',
    'faros_DataQualitySummary',
  ];

  private unRecognizedDataIssueObjects: AirbyteRecord[] = [];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const res: DestinationRecord[] = [];
    const data_obj = record.record.data;
    if ('faros_DataQualityIssue' in data_obj) {
      const data_quality_issue: DataQualityIssue = data_obj as DataQualityIssue;
      return this.getDataQualityIssue(data_quality_issue);
    } else {
      this.unRecognizedDataIssueObjects.push(record);
    }
    return res;
  }

  private getDataQualityIssue(issue: DataQualityIssue): DestinationRecord[] {
    const summary_obj = this.getSummaryObjectFromDataIssue(issue);
    return [
      {
        model: 'faros_DataQualityIssue',
        record: {
          uid: issue.uid,
          model: issue.model,
          description: issue.description,
          recordIds: issue.recordIds,
          createdAt: issue.created_at,
          summary: summary_obj,
        },
      },
    ];
  }

  private getSummaryObjectFromDataIssue(
    issue: DataQualityIssue
  ): SummaryKey | null {
    let summary_obj = null;
    if (issue.summary) {
      summary_obj = {
        uid: issue.summary.uid,
        source: issue.summary.source,
      };
    }
    return summary_obj;
  }
}
