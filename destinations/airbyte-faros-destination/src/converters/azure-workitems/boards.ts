import {AirbyteRecord} from '../../../../../faros-airbyte-cdk/lib';
import {DestinationModel, DestinationRecord} from '../converter';
import {AzureWorkitemsConverter} from './common';
import {Board} from './models';

export class Boards extends AzureWorkitemsConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_TaskBoard',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const board = record.record.data as Board;
    const organizationName = this.getOrganizationFromUrl(board.url);
    const organization = {uid: organizationName, source};
    const results = [];
    const uid = board.id;

    results.push({
      model: 'tms_Project',
      record: {
        uid,
        name: board.name,
        organization,
      },
    });

    results.push({
      model: 'tms_TaskBoard',
      record: {
        uid: String(board.id),
        name: board.name,
        organization,
      },
    });

    return results;
  }
}
