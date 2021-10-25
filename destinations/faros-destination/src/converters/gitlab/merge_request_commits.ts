import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GitlabCommon, GitlabConverter} from './common';

export class GitlabMergeRequestCommits extends GitlabConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['vcs_Commit'];

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const commit = record.record.data;

    const repository = GitlabCommon.parseRepositoryKey(commit.web_url, source);

    if (!repository) return [];

    return [
      {
        model: 'vcs_Commit',
        record: {
          sha: commit.sha,
          message: commit.description?.substring(
            0,
            GitlabCommon.MAX_DESCRIPTION_LENGTH
          ),
          author: commit.author ? {uid: commit.author.username, source} : null,
          htmlUrl: commit.web_url,
          createdAt: Utils.toDate(commit.created_at),
          repository,
        },
      },
    ];
  }
}
