import {DestinationModel, DestinationRecord} from '../converter';
import {JiraConverter} from './common';

// Required as dependency Sprints converter
export class SprintIssues extends JiraConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [];

  async convert(): Promise<ReadonlyArray<DestinationRecord>> {
    return [];
  }
}
