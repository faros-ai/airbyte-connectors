import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {
  DestinationModel,
  DestinationRecord,
  StreamContext,
  StreamName,
} from '../converter';
import {
  Component,
  ComponentsStream,
  ComponentUptime,
  StatuspageConverter,
} from './common';

export class ComponentUptimes extends StatuspageConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'ims_ApplicationUptime',
  ];

  override get dependencies(): ReadonlyArray<StreamName> {
    return [ComponentsStream];
  }

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const uptime = record.record.data as ComponentUptime;
    const component = {
      id: uptime.id,
      name: uptime.name,
      page_id: uptime.page_id,
      group_id: uptime.group_id,
    } as Component;
    const application = this.computeApplication(ctx, component);
    // Generate uid from uptime page_id, component id, range_start, and range_end
    const uid = `${uptime.page_id}:${uptime.id}:${uptime.range_start}-${uptime.range_end}`;
    return [
      {
        model: 'ims_ApplicationUptime',
        record: {
          uid,
          intervalStartTime: Utils.toDate(uptime.range_start),
          intervalEndTime: Utils.toDate(uptime.range_end),
          uptimePercentage: uptime.uptime_percentage,
          majorOutageDuration: uptime.major_outage,
          partialOutageDuration: uptime.partial_outage,
          application,
          source: this.streamName.source,
        },
      },
    ];
  }
}
