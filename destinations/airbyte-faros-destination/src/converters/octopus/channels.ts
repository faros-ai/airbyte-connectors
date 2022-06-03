import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {OctopusConverter} from './common';
import {Channel} from './models';

export class Channels extends OctopusConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Channel',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const channel = record.record.data as Channel;
    const uid = channel.Id;
    const res: DestinationRecord[] = [];

    res.push({
      model: 'cicd_Channel',
      record: {
        uid,
        name: channel.Name,
        description: channel.Description,
        projectId: channel.ProjectId,
        lifecycleId: channel.LifecycleId,
        spaceId: channel.SpaceId,
        isDefault: channel.IsDefault,
        tenantTags: channel.TenantTags,
        source,
      },
    });
    return res;
  }
}
