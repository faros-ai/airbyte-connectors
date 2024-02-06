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
    const uid = user.accountId ?? user.name;
    const source = this.streamName.source;
    const organizationName = this.getOrganizationFromUrl(user.self);
    const organization = {uid: organizationName, source};

    if (!uid) {
      ctx.logger.warn(
        `Skipping user. User has no accountId or name defined: ${JSON.stringify(
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
          organization,
        },
      },
    ];
  }
}
