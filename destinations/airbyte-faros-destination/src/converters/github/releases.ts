import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord} from '../converter';
import {GitHubCommon, GitHubConverter} from './common';

export class Releases extends GitHubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Release',
    'cicd_ReleaseTagAssociation',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const release = record.record.data;
    const res: DestinationRecord[] = [];
    const uid = `${release.id}`;
    const repository = GitHubCommon.parseRepositoryKey(
      release.repository,
      source
    );

    if (!repository) return res;

    const author = release.author?.login
      ? {uid: release.author.login, source}
      : null;

    res.push({
      model: 'cicd_Release',
      record: {
        uid,
        name: release.name,
        htmlUrl: release.html_url,
        description: release.body,
        notes: release.body,
        draft: release.draft,
        prerelease: release.prerelease,
        createdAt: Utils.toDate(release.created_at),
        releasedAt: Utils.toDate(release.published_at),
        publishedAt: Utils.toDate(release.published_at),
        author,
        source,
      },
    });

    res.push({
      model: 'cicd_ReleaseTagAssociation',
      record: {
        release: {uid, source},
        tag: {
          repository,
          name: release.tag_name,
        },
      },
    });

    return res;
  }
}
