import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {GitlabCommon, GitlabConverter} from '../common/gitlab';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';

export class Commits extends GitlabConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['vcs_Commit'];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const commit = record.record.data;

    const repository = GitlabCommon.parseRepositoryKey(commit.web_url, source);

    if (!repository) return [];

    return [
      {
        model: 'vcs_Commit',
        record: {
          sha: commit.id,
          uid: commit.id,
          message: commit.message,
          author: commit.author_name ? {uid: commit.author_name, source} : null,
          htmlUrl: commit.web_url,
          createdAt: Utils.toDate(commit.created_at),
          repository,
        },
      },
    ];
  }
}
