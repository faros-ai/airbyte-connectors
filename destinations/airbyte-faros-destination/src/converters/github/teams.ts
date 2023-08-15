import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord} from '../converter';
import {GitHubCommon, GitHubConverter} from './common';

export class Teams extends GitHubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_Team',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const team = record.record.data;
    const res: DestinationRecord[] = [];



    res.push({
      model: 'vcs_Team',
      record: {
        teamId: team.id,
        name: team.name,
        slug: team.slug,
        description: team.description,
        privacy: team.privacy,
        url: team.url,
        source,
      },
    });

    return res;
  }
}