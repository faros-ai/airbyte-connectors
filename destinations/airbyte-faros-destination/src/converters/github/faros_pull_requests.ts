import {AirbyteRecord} from 'faros-airbyte-cdk';
import {PullRequest} from 'faros-airbyte-common/github';
import {Utils} from 'faros-js-client';
import {camelCase, last, toLower, upperFirst} from 'lodash';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GitHubConverter} from './common';

export class FarosPullRequests extends GitHubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_PullRequest',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const pr = record.record.data as PullRequest;

    this.collectUser(pr.author);

    // Github PR states
    const prStates = ['closed', 'merged', 'open'];

    const stateDetail = pr.isDraft ? 'DRAFT' : pr.state;
    const state = prStates.includes(pr.state.toLowerCase())
      ? {category: upperFirst(camelCase(pr.state)), detail: stateDetail}
      : {category: 'Custom', detail: stateDetail};

    const lastReviewEvent = last(pr.reviewEvents?.nodes ?? []);
    let readyForReviewAt = null;
    if (!lastReviewEvent && !pr.isDraft) {
      readyForReviewAt = Utils.toDate(pr.createdAt);
    } else if (lastReviewEvent?.type === 'ReadyForReviewEvent') {
      readyForReviewAt = Utils.toDate(lastReviewEvent?.createdAt);
    }

    return [
      {
        model: 'vcs_PullRequest',
        record: {
          repository: {
            name: toLower(pr.repo),
            organization: {
              uid: toLower(pr.org),
              source: this.streamName.source,
            },
          },
          number: pr.number,
          title: pr.title,
          description: Utils.cleanAndTruncate(pr.body),
          state,
          htmlUrl: pr.url,
          createdAt: Utils.toDate(pr.createdAt),
          updatedAt: Utils.toDate(pr.updatedAt),
          mergedAt: Utils.toDate(pr.mergedAt),
          readyForReviewAt,
          commitCount: pr.commits.totalCount,
          commentCount: pr.comments.totalCount, // + reviewCommentCount ??? https://github.com/faros-ai/feeds/blob/2359a0c6191f8293ad7fc3f032212a38e3f1e3b6/feeds/vcs/github-feed/src/feed.ts#L1169
          diffStats: {
            linesAdded: pr.additions,
            linesDeleted: pr.deletions,
            filesChanged: pr.changedFiles,
          },
          author: pr.author
            ? {uid: pr.author.login, source: this.streamName.source}
            : null,
          mergeCommit: pr.mergeCommit
            ? {repository: pr.repo, sha: pr.mergeCommit.oid}
            : null,
          // ...branchInfo, https://github.com/faros-ai/feeds/commit/865536ae5bae6f9c1edb6a4ea826d91caf9a6136#diff-62dd1a5f8c5bafec2c89e9f598c58ee32673e3d2b8a6ef60a75fc612be45bc72
        },
      },
    ];
  }

  async onProcessingComplete(
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    return this.convertUsers();
  }
}
