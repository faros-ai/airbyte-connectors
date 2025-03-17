import {AirbyteRecord} from 'faros-airbyte-cdk';
import {User} from 'faros-airbyte-common/wolken';
import jsonata from 'jsonata';
import _ from 'lodash';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {WolkenConverter} from './common';

export class Users extends WolkenConverter {
  id(record: AirbyteRecord) {
    return record?.record?.data?.userPsNo;
  }

  toContextStorageRecord(record: AirbyteRecord, ctx: StreamContext) {
    const user = record.record.data as User;
    const jsonataPaths = new Set([
      ...Object.values(this.userLookupExtraFieldsMapping(ctx)),
    ]);
    const userCompact = {};
    for (const jsonataPath of jsonataPaths) {
      let jsonataExpr: jsonata.Expression;
      try {
        jsonataExpr = jsonata(jsonataPath);
      } catch (e: any) {
        ctx.logger.warn(
          `Error evaluating user lookup jsonata path expression ${jsonataPath}: ${e.message}`
        );
        continue;
      }
      const value = jsonataExpr.evaluate(user);
      if (value) {
        _.set(userCompact, jsonataPath, value);
      }
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
