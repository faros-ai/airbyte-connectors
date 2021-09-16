import {AirbyteRecord} from 'faros-airbyte-cdk';

import {
  Converter,
  DestinationModel,
  DestinationRecord,
  StreamContext,
} from '../converter';
import {GithubCommon} from './common';

export class GithubTags extends Converter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['vcs_Tag'];

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const tag = record.record.data;
    const repository = GithubCommon.parseRepositoryKey(tag.repository, source);

    if (!repository) return [];

    return [
      {
        model: 'vcs_Tag',
        record: {
          name: tag.name,
          commit: tag?.commit?.sha ? {repository, sha: tag.commit.sha} : null,
          repository,
        },
      },
    ];
  }
}
