import {AirbyteRecord} from 'faros-airbyte-cdk';
import {toLower} from 'lodash';

import {
  Converter,
  DestinationModel,
  DestinationRecord,
  StreamName,
} from '../converter';

export class GithubTags implements Converter {
  readonly streamName = new StreamName('github', 'tags');
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['vcs_Tag'];

  convert(record: AirbyteRecord): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const tag = record.record.data;

    const orgRepo: ReadonlyArray<string> = tag.repository.split('/');
    if (orgRepo.length != 2) return [];

    const [organization, repositoryName] = orgRepo;
    const repository = {
      name: toLower(repositoryName),
      organization: {uid: toLower(organization), source},
    };

    return [
      {
        model: 'vcs_Tag',
        record: {
          name: tag.name,
          commit: {repository, sha: tag.commit.sha},
          repository,
        },
      },
    ];
  }
}
