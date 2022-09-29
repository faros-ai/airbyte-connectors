import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Common} from '../common/common';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {Service, SquadcastConverter} from './common';

export class Services extends SquadcastConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'compute_Application',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const service = record.record.data as Service;

    const applicationMapping = this.applicationMapping(ctx);

    let application = Common.computeApplication(service.name);

    if (
      service.name in applicationMapping &&
      applicationMapping[service.name].name
    ) {
      const mappedApp = applicationMapping[service.name];
      application = Common.computeApplication(
        mappedApp.name,
        mappedApp.platform
      );
    }

    return [{model: 'compute_Application', record: application}];
  }
}
