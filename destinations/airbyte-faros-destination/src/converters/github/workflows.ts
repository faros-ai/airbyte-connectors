import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord} from '../converter';
import {GitHubCommon, GitHubConverter} from './common';

export class Workflows extends GitHubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Organization',
    'cicd_Pipeline',
  ];

  private seenOrganizations = new Set<string>();

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const workflow = record.record.data;
    const repositoryKey = GitHubCommon.parseRepositoryKey(
      workflow.repository,
      source
    );

    if (!repositoryKey) return [];

    const res = [];
    const organization = repositoryKey.organization;

    if (!this.seenOrganizations.has(organization.uid)) {
      this.seenOrganizations.add(organization.uid);
      res.push({
        model: 'cicd_Organization',
        record: {
          ...organization,
          name: organization.uid,
        },
      });
    }

    res.push({
      model: 'cicd_Pipeline',
      record: {
        uid: workflow.id.toString(),
        name: workflow.name,
        url: workflow.url,
        organization,
      },
    });

    return res;
  }
}
