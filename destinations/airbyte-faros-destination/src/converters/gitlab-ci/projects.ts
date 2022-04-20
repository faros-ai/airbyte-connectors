import {AirbyteRecord} from 'faros-airbyte-cdk';

import {GitlabCommon, GitlabConverter} from '../common/gitlab';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';

export class Projects extends GitlabConverter {
  source = 'GitLab-CI';

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
