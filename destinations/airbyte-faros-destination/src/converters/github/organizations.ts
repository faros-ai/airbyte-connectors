import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';
import {camelCase, toLower, upperFirst} from 'lodash';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GitHubConverter} from './common';

// Github org types
const orgTypes = ['organization', 'workspace', 'group'];

export class Organizations extends GitHubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_Organization',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const org = record.record.data;

    const type = orgTypes.includes(org.type.toLowerCase())
      ? {category: upperFirst(camelCase(org.type)), detail: org.type}
      : {category: 'Custom', detail: org.type};

    const uid = toLower(org.login);

    return [
      {
        model: 'vcs_Organization',
        record: {
          uid,
          name: org.name ? org.name : uid,
          htmlUrl: org.html_url,
          type,
          createdAt: Utils.toDate(org.created_at),
          source,
        },
      },
    ];
  }
}
