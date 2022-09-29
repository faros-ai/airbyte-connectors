import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Common} from '../common/common';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {Service, SquadcastConverter} from './common';

export class Services extends SquadcastConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'compute_Application',
  ];

  private seenApplications = new Set<string>();

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const res: DestinationRecord[] = [];
    const service = record.record.data as Service;

    const applicationMapping = this.applicationMapping(ctx);
    const mappedApp = applicationMapping[service.name];
    const application = Common.computeApplication(
      mappedApp?.name ?? service.name,
      mappedApp?.platform
    );
    const appKey = application.uid;
    if (!this.seenApplications.has(appKey)) {
      res.push({model: 'compute_Application', record: application});
      this.seenApplications.add(appKey);
    }

    return res;
  }
}
