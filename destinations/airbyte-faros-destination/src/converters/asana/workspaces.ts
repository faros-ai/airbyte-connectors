import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord} from '../converter';
import {AsanaConverter} from './common';

export class Workspaces extends AsanaConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_Project'];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const workspace = record.record.data;

    const tmsProject: DestinationRecord = {
      model: 'tms_Project',
      record: {
        uid: workspace.gid,
        name: workspace.name,
        source,
      },
    };

    return [tmsProject];
  }
}
