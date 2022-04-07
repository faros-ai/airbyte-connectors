import {AirbyteRecord} from 'faros-airbyte-cdk';

import {
  DestinationModel,
  DestinationRecord,
  StreamContext,
  StreamName,
} from '../converter';
import {GitlabCommon, GitlabConverter} from './common';

export class Projects extends GitlabConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Pipeline',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const project = record.record.data;

    const repository = GitlabCommon.parseRepositoryKey(project.webUrl, source);

    if (!repository) return [];

    return [
      {
        model: 'cicd_Pipeline',
        record: {
          uid: project.path?.toLowerCase(),
          name: project.name,
          description: project.description?.substring(
            0,
            GitlabCommon.MAX_DESCRIPTION_LENGTH
          ),
          url: project.webUrl,
          organization: repository.organization,
        },
      },
    ];
  }
}
