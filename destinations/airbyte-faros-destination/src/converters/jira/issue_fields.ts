import {DestinationModel, DestinationRecord} from '../converter';
import {JiraConverter} from './common';

// Required as dependency by Issues and Sprints stream
export class IssueFields extends JiraConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [];

  async convert(): Promise<ReadonlyArray<DestinationRecord>> {
    return [];
  }
}
