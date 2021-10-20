import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {PhabricatorCommon, PhabricatorConverter} from './common';

export class PhabricatorUsers extends PhabricatorConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_Membership',
    'vcs_User',
  ];

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const user = record.record.data;
    const res: DestinationRecord[] = [];
    const uid = user.phid;

    res.push({
      model: 'vcs_User',
      record: {
        uid,
        name: user.fields?.username ?? user.fields?.realName ?? null,
        htmlUrl: null,
        type: PhabricatorCommon.vcs_UserType(user),
        source,
      },
    });

    res.push({
      model: 'vcs_Membership',
      record: {
        user: {uid, source},
        organization: PhabricatorCommon.orgKey(source),
      },
    });

    return res;
  }
}
