import {DestinationModel, DestinationRecord} from '../converter';
import {JiraConverter} from './common';

// Required as dependency by Issues converter
export class WorkflowStatuses extends JiraConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [];

  async convert(): Promise<ReadonlyArray<DestinationRecord>> {
    return [];
  }
}
