import {AirbyteRecord} from 'faros-airbyte-cdk';
import {FarosReleaseOutput} from 'faros-airbyte-common/gitlab';
import {Utils} from 'faros-js-client';
import {toLower} from 'lodash';

import {
  DestinationModel,
  DestinationRecord,
  StreamContext,
} from '../converter';
import {GitlabConverter} from './common';

export class FarosReleases extends GitlabConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Release',
    'cicd_ReleaseTagAssociation',
  ];

  async convert(
    record: AirbyteRecord,
    ctx?: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const release = record.record.data as FarosReleaseOutput;
    const res: DestinationRecord[] = [];

    const repository = {
      name: toLower(release.project_path),
      uid: toLower(release.project_path),
      organization: {
        uid: release.group_id,
        source,
      },
    };

    const uid = `${repository.uid}/${release.tag_name}`;
    res.push({
      model: 'cicd_Release',
      record: {
        uid,
        name: release.name,
        url: release._links?.self ?? null,
        description: Utils.cleanAndTruncate(release.description),
        createdAt: Utils.toDate(release.created_at),
        releasedAt: Utils.toDate(release.released_at),
        author: release.author_username ? {uid: release.author_username, source} : null,
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