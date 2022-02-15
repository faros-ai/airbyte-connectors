import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GithubCommon, GithubConverter} from './common';

export class GithubTags extends GithubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['vcs_Tag'];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const tag = record.record.data;
    const repository = GithubCommon.parseRepositoryKey(tag.repository, source);

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
