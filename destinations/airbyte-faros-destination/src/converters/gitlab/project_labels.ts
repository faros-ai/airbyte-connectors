import {AirbyteRecord} from 'faros-airbyte-cdk';

import {GitlabConverter} from '../common/gitlab';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';

export class ProjectLabels extends GitlabConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_Label'];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const label = record.record.data;

    return [{model: 'tms_Label', record: {name: label.name}}];
  }
}
