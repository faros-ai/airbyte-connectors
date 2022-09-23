import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord} from '../converter';
import {GitlabCommon, GitlabConverter} from '../gitlab/common';

export class Groups extends GitlabConverter {
  source = 'GitLab-CI';

  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Organization',
  ];

  async convert(
    record: AirbyteRecord
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
