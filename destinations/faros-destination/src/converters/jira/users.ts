import {AirbyteLogger, AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {JiraConverter} from './common';

export class JiraUsers extends JiraConverter {
  private logger = new AirbyteLogger();

  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_User'];

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const user = record.record.data;
    const uid = user.accountId ?? user.name;
    if (!uid) {
      this.logger.warn(
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
        },
      },
    ];
  }
}
