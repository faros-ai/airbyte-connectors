import {AirbyteRecord} from 'faros-airbyte-cdk';

import {
  Converter,
  DestinationModel,
  DestinationRecord,
  StreamContext,
} from '../converter';
import {DataQualityIssue, SummaryKey} from './models';

export class DataQualityTests extends Converter {
  source = 'faros-graphdoctor';

  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'faros_DataQualityIssue',
    'faros_DataQualitySummary',
  ];

  private unRecognizedDataIssueRecords: AirbyteRecord[] = [];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const res: DestinationRecord[] = [];
    const data_obj = record.record.data;
    if ('faros_DataQualityIssue' in data_obj) {
      const data_quality_issue: DataQualityIssue = data_obj[
        'faros_DataQualityIssue'
      ] as DataQualityIssue;
      return this.getDataQualityIssue(data_quality_issue);
    } else {
      this.unRecognizedDataIssueRecords.push(record);
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

  private AirbyterRecordsToString(l: AirbyteRecord[]): string {
    return JSON.stringify(l);
  }

  async onProcessingComplete(
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    ctx.logger.info(
      `Unidentified records:\n${this.AirbyterRecordsToString(
        this.unRecognizedDataIssueRecords
      )}`
    );
    return [];
  }
}
