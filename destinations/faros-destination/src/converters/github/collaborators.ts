import {AirbyteRecord} from 'cdk';

import {
  Converter,
  DestinationModel,
  DestinationRecord,
  StreamName,
} from '../converter';

export class GithubCollaborators implements Converter {
  readonly streamName = new StreamName('github', 'collaborators');
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_User',
    'vcs_Membership',
  ];

  convert(record: AirbyteRecord): ReadonlyArray<DestinationRecord> {
    const user = record.record.data;

    const type = ((): {category: string; detail: string} => {
      if (!user.type) {
        return {category: 'Custom', detail: 'unknown'};
      }
      const userTypeLower = user.type.toLowerCase();
      switch (userTypeLower) {
        case 'enterpriseuseraccount':
        case 'user':
          return {category: 'User', detail: userTypeLower};
        case 'bot':
          return {category: 'Bot', detail: userTypeLower};
        case 'organization':
          return {category: 'Organization', detail: userTypeLower};
        case 'mannequin':
          return {category: 'Mannequin', detail: userTypeLower};
        default:
          return {category: 'Custom', detail: userTypeLower};
      }
    })();

    return [
      {
        model: 'vcs_User',
        record: {
          uid: user.login,
          name: user.name ?? null,
          htmlUrl: user.html_url ?? null,
          type,
          source: this.streamName.source,
        },
      },
    ];
  }
}
