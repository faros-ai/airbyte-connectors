import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord} from '../converter';
import {GitlabConverter} from './common';

export class GroupLabels extends GitlabConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_Label'];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const label = record.record.data;

    return [{model: 'tms_Label', record: {name: label.name}}];
  }
}
