import {AirbyteRecord} from 'faros-airbyte-cdk';

import {
  DestinationModel,
  DestinationRecord,
  StreamContext,
  StreamName,
} from '../converter';
import {
  Component,
  ComponentGroupsStream,
  PagesStream,
  StatuspageConverter,
} from './common';

export class Components extends StatuspageConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'compute_Application',
  ];

  override get dependencies(): ReadonlyArray<StreamName> {
    return [ComponentGroupsStream, PagesStream];
  }

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const component = record.record.data as Component;
    if (component.group) {
      return [];
    }
    return [
      {
        model: 'compute_Application',
        record: this.computeApplication(ctx, component),
      },
    ];
  }
}
