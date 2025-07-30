import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {
  DestinationModel,
  DestinationRecord,
  StreamContext,
  StreamName,
} from '../converter';
import {GitlabCommon, GitlabConverter} from './common';

export class MergeRequests extends GitlabConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_PullRequest',
  ];

  private readonly usersStream = new StreamName('gitlab', 'users');

  override get dependencies(): ReadonlyArray<StreamName> {
    return [this.usersStream];
  }

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const mr = record.record.data;

    const repository = GitlabCommon.parseRepositoryKey(mr.web_url, source);

    if (!repository) return [];

    const usersStream = this.usersStream.asString;
    const user = ctx.get(usersStream, String(mr.author_id));
    const username = user?.record?.data?.username;

    return [
      {
        model: 'vcs_PullRequest',
        record: {
          number: mr.id,
          uid: mr.id.toString(),
          title: mr.title,
          state: this.pullRequestState(mr.state),
          htmlUrl: mr.web_url,
          createdAt: Utils.toDate(mr.created_at),
          updatedAt: Utils.toDate(mr.updated_at),
          mergedAt: Utils.toDate(mr.merged_at),
          closedAt: Utils.toDate(mr.closed_at),
          commentCount: Utils.parseInteger(mr.user_notes_count),
          author: username ? {uid: username, source} : null,
          mergeCommit: mr.merge_commit_sha
            ? {repository, sha: mr.merge_commit_sha, uid: mr.merge_commit_sha}
            : null,
          repository,
        },
      },
    ];
  }

  private pullRequestState(state?: string): {
    category: string;
    detail: string;
  } {
    const detail = state?.toLowerCase();
    switch (detail) {
      case 'closed':
      case 'locked':
        return {category: 'Closed', detail};
      case 'merged':
        return {category: 'Merged', detail};
      case 'opened':
        return {category: 'Open', detail};
      default:
        return {category: 'Custom', detail};
    }
  }
}
