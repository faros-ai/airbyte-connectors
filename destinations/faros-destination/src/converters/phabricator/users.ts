import {AirbyteRecord} from 'faros-airbyte-cdk';

import {
  DestinationModel,
  DestinationRecord,
  StreamContext,
  StreamName,
} from '../converter';
import {PhabricatorCommon, PhabricatorConverter} from './common';

export class PhabricatorUsers extends PhabricatorConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_Membership',
    'vcs_User',
  ];

  private readonly repositoriesStream = new StreamName(
    'phabricator',
    'repositories'
  );

  override get dependencies(): ReadonlyArray<StreamName> {
    return [this.repositoriesStream];
  }

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

    // Get organization information from one of the repositories
    // and assign users to this organization
    const repositoriesStream = this.repositoriesStream.stringify();
    const repos = ctx.getAll(repositoriesStream);
    const repo = repos ? Object.values(repos)[0] : undefined;
    const repoKey = PhabricatorCommon.parseRepositoryKey(
      repo?.record?.data,
      source
    );
    if (repoKey) {
      res.push({
        model: 'vcs_Membership',
        record: {
          user: {uid, source},
          organization: {uid: repoKey.organization.uid, source},
        },
      });
    }

    return res;
  }
}
