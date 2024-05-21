import {AirbyteRecord} from 'faros-airbyte-cdk';
import {User} from 'faros-airbyte-common/jira';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {JiraConverter} from './common';
export class Users extends JiraConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_User'];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const user = record.record.data as User;
    const uid = user.emailAddress ?? user.accountId;
    const source = this.streamName.source;
    const organizationName = this.getOrganizationFromUrl(user.self);
    const organization = {uid: organizationName, source};

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
          organization,
        },
      },
    ];
  }
}
