import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GitHubCommon, GitHubConverter} from './common';

export class Workflows extends GitHubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Pipeline',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const workflow = record.record.data;
    const repositoryKey = GitHubCommon.parseRepositoryKey(
      workflow.repository,
      source
    );

    if (!repositoryKey) return [];

    const organization = repositoryKey.organization;

    return [
      {
        model: 'cicd_Organization',
        record: {
          uid: organization,
          name: organization,
          source,
        },
      },
      {
        model: 'cicd_Pipeline',
        record: {
          uid: workflow.id,
          name: workflow.name,
          url: workflow.url,
          organization: {uid: organization, source},
        },
      },
    ];
  }
}
