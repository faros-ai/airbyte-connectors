import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {Converter, DestinationModel, DestinationRecord} from '../converter';
import {GithubCommon} from './common';

export class GithubReleases extends Converter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Release',
    'cicd_ReleaseTagAssociation',
  ];

  convert(record: AirbyteRecord): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const release = record.record.data;
    const res: DestinationRecord[] = [];
    const uid = `${release.id}`;
    const repository = GithubCommon.parseRepositoryKey(
      release.repository,
      source
    );

    if (!repository) return res;

    // TODO: change user uid to login once it's available
    const author = release.author_id
      ? {uid: `${release.author_id}`, source}
      : null;

    res.push({
      model: 'cicd_Release',
      record: {
        uid,
        name: release.name,
        htmlUrl: release.html_url,
        notes: release.body,
        draft: release.draft,
        prerelease: release.prerelease,
        createdAt: Utils.toDate(release.created_at),
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
