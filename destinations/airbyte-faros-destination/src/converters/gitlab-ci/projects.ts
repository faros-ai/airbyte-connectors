import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord} from '../converter';
import {GitlabCommon, GitlabConverter} from '../gitlab/common';

export class Projects extends GitlabConverter {
  source = 'GitLab-CI';

  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Pipeline',
  ];

  async convert(
    record: AirbyteRecord
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
          description: Utils.cleanAndTruncate(
            project.description,
            GitlabCommon.MAX_DESCRIPTION_LENGTH
          ),
          url: project.webUrl,
          organization: repository.organization,
        },
      },
    ];
  }
}
