import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {
  computeApplication,
  HarnessNextgenConverter,
  HarnessNextgenService,
} from './common';

export class Services extends HarnessNextgenConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'compute_Application',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const service = record.record.data as HarnessNextgenService;
    const res: DestinationRecord[] = [];

    const application = computeApplication(service.name, service.type);

    res.push({
      model: 'compute_Application',
      record: application,
    });

    return res;
  }
}
