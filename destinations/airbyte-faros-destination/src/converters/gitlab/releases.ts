import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {
  DestinationModel,
  DestinationRecord,
  StreamContext,
  StreamName,
} from '../converter';
import {GitlabCommon, GitlabConverter} from './common';

export class Releases extends GitlabConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Release',
    'cicd_ReleaseTagAssociation',
  ];

  private readonly usersStream = new StreamName('gitlab', 'users');

  override get dependencies(): ReadonlyArray<StreamName> {
    return [this.usersStream];
  }

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const release = record.record.data;
    const res: DestinationRecord[] = [];

    if (!release._links || !release._links.self) {
      ctx.logger.warn('Could not find property for identifying release');
      return res;
    }

    const repository = GitlabCommon.parseRepositoryKey(
      release._links.self,
      source
    );
    const usersStream = this.usersStream.asString;
    const user = ctx.get(usersStream, String(release.author_id));
    const username = user?.record?.data?.username;

    const uid = `${repository.uid}/${release.tag_name}`;
    res.push({
      model: 'cicd_Release',
      record: {
        uid,
        name: release.name,
        url: release._links.self,
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
          repository,
        },
      },
    });

    return res;
  }
}
