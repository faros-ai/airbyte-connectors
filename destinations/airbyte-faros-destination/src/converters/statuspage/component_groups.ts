import {DestinationModel, DestinationRecord} from '../converter';
import {StatuspageConverter} from './common';

export class ComponentGroups extends StatuspageConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [];

  async convert(): Promise<ReadonlyArray<DestinationRecord>> {
    return [];
  }
}
