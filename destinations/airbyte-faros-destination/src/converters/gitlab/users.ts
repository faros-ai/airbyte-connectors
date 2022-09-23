import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord} from '../converter';
import {GitlabConverter} from './common';

export class Users extends GitlabConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['vcs_User'];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const user = record.record.data;

    // User has no username defined. Skipping saving.
    if (!user?.username) return [];

    // GitLab doesn't indicate user type
    const type = {category: 'User', detail: 'user'};
    return [
      {
        model: 'vcs_User',
        record: {
          uid: user.username,
          name: user.name ?? null,
          htmlUrl: user.web_url ?? null,
          type,
          source,
        },
      },
    ];
  }
}
