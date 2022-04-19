import {AirbyteRecord} from 'faros-airbyte-cdk';

import {GitlabCommon, GitlabConverter} from '../common/gitlab';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';

export class Groups extends GitlabConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Organization',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const group = record.record.data;

    return [
      {
        model: 'cicd_Organization',
        record: {
          uid: group.path,
          description: group.description?.substring(
            0,
            GitlabCommon.MAX_DESCRIPTION_LENGTH
          ),
          name: group.name,
          url: group.webUrl,
          source,
        },
      },
    ];
  }
}
