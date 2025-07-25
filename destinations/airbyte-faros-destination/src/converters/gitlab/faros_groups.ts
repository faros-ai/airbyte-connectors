import {AirbyteRecord} from 'faros-airbyte-cdk';
import {FarosGroupOutput} from 'faros-airbyte-common/gitlab';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord} from '../converter';
import {GitlabConverter} from './common';

export class FarosGroups extends GitlabConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_Organization',
    'cicd_Organization',
  ];

  async convert(
    record: AirbyteRecord,
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const group = record.record.data as FarosGroupOutput;
    const res: DestinationRecord[] = [];

    res.push({
      model: 'vcs_Organization',
      record: {
        uid: group.id,
        name: group.name,
        htmlUrl: group.web_url,
        type: {category: 'Group', detail: 'Group'},
        createdAt: Utils.toDate(group.created_at),
        source,
      },
    });

    res.push({
      model: 'cicd_Organization',
      record: {
        uid: group.id,
        source,
        name: group.name,
        description: Utils.cleanAndTruncate(group.description),
        url: group.web_url,
      },
    });

    return res;
  }
}
