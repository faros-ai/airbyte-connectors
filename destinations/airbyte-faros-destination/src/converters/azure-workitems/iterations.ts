import {AirbyteRecord} from '../../../../../faros-airbyte-cdk/lib';
import {DestinationModel, DestinationRecord} from '../converter';
import {AzureWorkitemsConverter} from './common';
import {Iteration} from './models';

export class Iterations extends AzureWorkitemsConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_Sprint'];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const Iteration = record.record.data as Iteration;
    const source = this.streamName.source;
    const organizationName = this.getOrganizationFromUrl(Iteration?.url);
    const organization = {uid: organizationName, source};
    return [
      {
        model: 'tms_Sprint',
        record: {
          uid: String(Iteration.id),
          name: Iteration.name,
          state: Iteration.attributes.timeFrame,
          startedAt: Iteration.attributes.startDate,
          endedAt: Iteration.attributes.finishDate,
          organization,
        },
      },
    ];
  }
}
