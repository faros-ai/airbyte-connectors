import {AirbyteRecord} from 'faros-airbyte-cdk';
import {User} from 'faros-airbyte-common/wolken';
import _ from 'lodash';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {WolkenConverter} from './common';

export class Users extends WolkenConverter {
  id(record: AirbyteRecord) {
    return record?.record?.data?.userPsNo;
  }

  toContextStorageRecord(record: AirbyteRecord, ctx: StreamContext) {
    const user = record.record.data as User;
    const paths = new Set([
      ...Object.values(this.userLookupExtraFieldsMapping(ctx)),
    ]);
    const userCompact = {};
    for (const path of paths) {
      _.set(userCompact, path, _.get(user, path));
    }
    return AirbyteRecord.make(this.streamName.asString, userCompact);
  }

  readonly destinationModels: ReadonlyArray<DestinationModel> = ['ims_User'];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const user = record.record.data as User;

    return [
      {
        model: 'ims_User',
        record: {
          uid: user.userId.toString(),
          email: user.userEmail ?? user.userPsNo,
          name: `${user.userFname} ${user.userLname}`,
          source,
        },
      },
    ];
  }
}
