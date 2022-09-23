import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord} from '../converter';
import {GitHubCommon, GitHubConverter} from './common';

export class Tags extends GitHubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['vcs_Tag'];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const tag = record.record.data;
    const repository = GitHubCommon.parseRepositoryKey(tag.repository, source);

    if (!repository) return [];

    return [
      {
        model: 'vcs_Tag',
        record: {
          name: tag.name,
          commit: tag?.commit?.sha
            ? {repository, sha: tag.commit.sha, uid: tag.commit.sha}
            : null,
          repository,
        },
      },
    ];
  }
}
