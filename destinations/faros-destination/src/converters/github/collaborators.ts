import {AirbyteRecord} from 'cdk';

import {Converter, DestinationModel, DestinationRecord} from '../converter';

export class GithubCollaborators implements Converter {
  readonly streamName = {prefix: 'github', name: 'collaborators'};
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_User',
    'vcs_Membership',
  ];

  convert(record: AirbyteRecord): ReadonlyArray<DestinationRecord> {
    return [];
  }
}
