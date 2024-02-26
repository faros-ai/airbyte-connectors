import {AirbyteRecord} from 'faros-airbyte-cdk';

import {
  Converter,
  DestinationModel,
  DestinationRecord,
  StreamContext,
} from '../converter';
import {DataQualityIssue, DataQualitySummary} from './models';

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
      const data_quality_issue = data_obj[
        'faros_DataQualityIssue'
      ] as DataQualityIssue;
      return this.getDataQualityIssue(data_quality_issue);
    } else if ('faros_DataQualitySummary' in data_obj) {
      const data_quality_summary = data_obj[
        'faros_DataQualitySummary'
      ] as DataQualitySummary;
      return this.getDataQualitySummary(data_quality_summary);
    } else {
      this.unRecognizedDataIssueRecords.push(record);
    }
    return res;
  }

  private getDataQualityIssue(issue: DataQualityIssue): DestinationRecord[] {
    return [
      {
        model: 'faros_DataQualityIssue',
        record: issue,
      },
    ];
  }

  private getDataQualitySummary(
    summary: DataQualitySummary
  ): DestinationRecord[] {
    return [
      {
        model: 'faros_DataQualitySummary',
        record: summary,
      },
    ];
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
