import {AirbyteLogger, AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {
  DestinationModel,
  DestinationRecord,
  StreamContext,
  StreamName,
} from '../converter';
import {GitlabConverter} from './common';

export class GitlabReleases extends GitlabConverter {
  private readonly logger: AirbyteLogger = new AirbyteLogger();

  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Release',
    'cicd_ReleaseTagAssociation',
  ];

  private readonly usersStream = new StreamName('gitlab', 'users');

  override get dependencies(): ReadonlyArray<StreamName> {
    return [this.usersStream];
  }

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const release = record.record.data;
    const res: DestinationRecord[] = [];

    const [, owner, repo] = (
      release.commit_path ||
      release.tag_path ||
      '/'
    ).split('/');

    if (!owner || !repo) {
      this.logger
        .warn(`Could not find commit_path or tag_path from StreamContext for
        this record: ${this.id}`);
      return res;
    }

    const usersStream = this.usersStream.asString;
    const user = ctx.get(usersStream, String(release.author_id));
    const username = user?.record?.data?.username;

    const uid = release.tag_name;
    res.push({
      model: 'cicd_Release',
      record: {
        uid,
        name: release.name,
        htmlUrl: release?._links?.self,
        description: release.description,
        createdAt: Utils.toDate(release.created_at),
        releasedAt: Utils.toDate(release.released_at),
        author: username ? {uid: username, source} : null,
        source,
      },
    });

    res.push({
      model: 'cicd_ReleaseTagAssociation',
      record: {
        release: {uid, source},
        tag: {
          name: release.tag_name,
          repository: {
            name: repo?.toLowerCase(),
            organization: {uid: owner?.toLowerCase(), source},
          },
        },
      },
    });

    return res;
  }
}
