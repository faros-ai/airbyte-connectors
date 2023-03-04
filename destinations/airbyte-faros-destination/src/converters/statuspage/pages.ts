import {DestinationModel, DestinationRecord} from '../converter';
import {StatuspageConverter} from './common';

export class Pages extends StatuspageConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [];

  async convert(): Promise<ReadonlyArray<DestinationRecord>> {
    return [];
  }
}
