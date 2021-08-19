import {AirbyteRecord} from 'cdk';

import {Converter, DestinationModel, DestinationRecord} from '../converter';

export class GithubAssignees implements Converter {
  readonly streamName = {prefix: 'github', name: 'assignees'};
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_User'];

  convert(record: AirbyteRecord): ReadonlyArray<DestinationRecord> {
    return [];
  }
}
