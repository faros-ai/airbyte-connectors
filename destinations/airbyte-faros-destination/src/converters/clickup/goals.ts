import {DestinationModel, DestinationRecord} from '../converter';
import {ClickUpConverter} from './common';

export class Goals extends ClickUpConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [];

  async convert(): Promise<ReadonlyArray<DestinationRecord>> {
    return [];
  }
}
