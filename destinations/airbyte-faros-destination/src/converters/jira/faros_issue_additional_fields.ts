import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {JiraConverter} from './common';

export class FarosIssueAdditionalFields extends JiraConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_Task__Update',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const issue = record.record.data;
    const additionalFields: any[] = [];
    for (const [name, value] of issue.additionalFields) {
      additionalFields.push({name, value});
    }

    return [
      {
        model: 'tms_Task__Update',
        record: {
          where: {uid: issue.key, source: this.source},
          mask: ['additionalFields'],
          patch: {additionalFields},
        },
      },
    ];
  }
}
