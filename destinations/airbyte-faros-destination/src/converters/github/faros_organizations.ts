import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Organization} from 'faros-airbyte-common/github';
import {Utils} from 'faros-js-client';
import {camelCase, toLower, upperFirst} from 'lodash';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GitHubConverter} from './common';

export class FarosOrganizations extends GitHubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_Organization',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const org = record.record.data as Organization;
    const res: DestinationRecord[] = [];

    const orgTypes = ['organization', 'workspace', 'group'];
    const type = orgTypes.includes(org.type.toLowerCase())
      ? {category: upperFirst(camelCase(org.type)), detail: org.type}
      : {category: 'Custom', detail: org.type};

    const uid = toLower(org.login);
    res.push({
      model: 'vcs_Organization',
      record: {
        uid,
        source: this.streamName.source,
        name: org.name ? org.name : uid,
        htmlUrl: org.html_url,
        type,
        createdAt: Utils.toDate(org.created_at),
      },
    });
    return res;
  }
}
