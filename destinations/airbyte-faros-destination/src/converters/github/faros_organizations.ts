import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';
import {toLower} from 'lodash';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GitHubConverter} from './common';
import {Organizations as CommunityOrganizations} from './organizations';

export class FarosOrganizations extends GitHubConverter {
  private alias = new CommunityOrganizations();

  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    ...this.alias.destinationModels,
    'cicd_Organization',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const baseRecords = await this.alias.convert(record, ctx);
    const res: DestinationRecord[] = [...baseRecords];

    if (this.cicdEnabled(ctx)) {
      const source = this.streamName.source;
      const org = record.record.data;
      const uid = toLower(org.login);

      res.push({
        model: 'cicd_Organization',
        record: {
          uid,
          name: org.name ? org.name : uid,
          description: Utils.cleanAndTruncate(org.description),
          url: org.html_url,
          source,
        },
      });
    }

    return res;
  }
}
