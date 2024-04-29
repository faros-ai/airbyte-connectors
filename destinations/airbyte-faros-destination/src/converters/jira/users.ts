import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {JiraConverter} from './common';

export class Users extends JiraConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_User'];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const user = record.record.data;
    const uid = user.accountId ?? user.key;
    if (!uid) {
      ctx.logger.warn(
        `Skipping user. User has no accountId or key defined: ${JSON.stringify(
          user
        )}`
      );
      return [];
    }
    return [
      {
        model: 'tms_User',
        record: {
          uid,
          name: user.displayName,
          emailAddress: user.emailAddress,
          source: this.streamName.source,
          inactive: user.active != null && !user.active,
        },
      },
    ];
  }
}
