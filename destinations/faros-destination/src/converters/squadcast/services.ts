import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {Service, SquadcastConverter} from './common';

export class SquadcastServices extends SquadcastConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'compute_Application',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const service = record.record.data as Service;

    const applicationMapping = this.applicationMapping(ctx);

    let application = {name: service.name, platform: ''};

    if (
      service.name in applicationMapping &&
      applicationMapping[service.name].name
    ) {
      const mappedApp = applicationMapping[service.name];
      application = {
        name: mappedApp.name,
        platform: mappedApp.platform ?? application.platform,
      };
    }

    return [{model: 'compute_Application', record: application}];
  }
}
