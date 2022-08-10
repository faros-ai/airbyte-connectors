import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {AzurePipelineConverter} from './common';
import {Release, UserTypeCategory} from './models';

export class Releases extends AzurePipelineConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Release',
    'vcs_User',
  ];

  private seenUsers = new Set<string>();

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const release = record.record.data as Release;
    const userType = {category: UserTypeCategory.USER, detail: 'user'};
    const res: DestinationRecord[] = [];

    if (!this.seenUsers.has(release.createdBy.id)) {
      this.seenUsers.add(release.createdBy.id);
      res.push({
        model: 'vcs_User',
        record: {
          uid: release.createdBy.id,
          name: release.createdBy.displayName,
          type: userType,
          htmlUrl: release.createdBy.url,
          source,
        },
      });
    }

    const createdAt = Utils.toDate(release.createdOn);
    const releasedAt = Utils.toDate(release.modifiedOn);
    res.push({
      model: 'cicd_Release',
      record: {
        uid: String(release.id),
        name: release.name,
        htmlUrl: release.url,
        description: release.description,
        createdAt,
        releasedAt,
        author: {uid: release.createdBy.id, source},
        source,
      },
    });
    return res;
  }
}
