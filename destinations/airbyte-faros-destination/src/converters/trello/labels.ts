import {AirbyteRecord} from 'faros-airbyte-cdk';
import _ from 'lodash';

import {DestinationModel, DestinationRecord} from '../converter';
import {TrelloConverter} from './common';
import {Label} from './models';

export class Labels extends TrelloConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_Label'];

  private seenNames: Set<string> = new Set();

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const label = record.record.data as Label;

    if (_.isNil(label.name) || this.seenNames.has(label.name)) {
      return [];
    }

    this.seenNames.add(label.name);

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
