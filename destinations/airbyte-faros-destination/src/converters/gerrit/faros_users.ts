import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GerritCommon, GerritConverter} from './common';

export class FarosUsers extends GerritConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_User',
    'tms_User',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const user = record.record.data;
    const source = this.gerritSource();

    const res: DestinationRecord[] = [];

    // Create vcs_User
    res.push(GerritCommon.vcs_User(user, source));

    // Create tms_User
    res.push(GerritCommon.tms_User(user, source));

    return res;
  }
}