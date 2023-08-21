import {AirbyteRecord} from 'faros-airbyte-cdk';
import {toLower} from 'lodash';

import {DestinationModel, DestinationRecord} from '../converter';
import {GitHubConverter} from './common';

export class Teams extends GitHubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['vcs_Team'];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const team = record.record.data;
    const res: DestinationRecord[] = [];

    res.push({
      model: 'vcs_Team',
      record: {
        name: team.name,
        uid: toLower(team.slug),
        description: team.description,
        source,
      },
    });

    return res;
  }
}
