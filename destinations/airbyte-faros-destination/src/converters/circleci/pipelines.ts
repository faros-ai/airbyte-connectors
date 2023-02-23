import {DestinationModel, DestinationRecord} from '../converter';
import {CircleCIConverter} from './common';

export class Pipelines extends CircleCIConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [];
  async convert(): Promise<ReadonlyArray<DestinationRecord>> {
    return [];
  }
}
