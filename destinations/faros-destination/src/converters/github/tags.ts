import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter, DestinationModel, DestinationRecord} from '../converter';
import {GithubCommon} from './common';

export class GithubTags extends Converter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['vcs_Tag'];

  convert(record: AirbyteRecord): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const tag = record.record.data;
    const repository = GithubCommon.parseRepositoryKey(tag.repository, source);

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
