import {AirbyteRecord} from 'faros-airbyte-cdk';
import {toLower} from 'lodash';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {BambooConverter} from './common';
import {Plan} from './models';

export class Plans extends BambooConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Pipeline',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const plan = record.record.data as Plan;
    const baseUrl = this.baseUrl(ctx);
    if (!baseUrl) {
      return [];
    }
    const orgId = new URL(baseUrl).hostname;

    if (!orgId) {
      return [];
    }
    return [
      {
        model: 'cicd_Pipeline',
        record: {
          uid: toLower(plan.searchEntity.key),
          name: plan.searchEntity.planName,
          organization: {uid: orgId, source},
        },
      },
    ];
  }
}
