import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {LinearConverter} from './common';
import {IssueLabel} from './models';

export class IssueLabels extends LinearConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_Label'];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const label = record.record.data as IssueLabel;
    return [
      {
        model: 'tms_Label',
        record: {
          name: label.name,
        },
      },
    ];
  }
}
