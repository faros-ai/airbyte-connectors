import {AirbyteRecord} from 'faros-airbyte-cdk';
import {
  PullRequest,
  PullRequestReviewRequest,
} from 'faros-airbyte-common/github';
import {Utils} from 'faros-js-client';
import {camelCase, isNil, last, omitBy, toLower, upperFirst} from 'lodash';

import {FileCollector} from '../common/vcs';
import {File, FileKey, fileKey, fileKeyToString, RepoKey} from '../common/vcs';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GitHubCommon, GitHubConverter, PartialUser} from './common';

type BranchKey = {
  uid: string;
  name: string;
  repository: RepoKey;
};

type ReviewState = {
  category: string;
  detail: string;
};

export class FarosPullRequests extends GitHubConverter {
  private collectedBranches = new Map<string, BranchKey>();
  private fileCollector = new FileCollector();

  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_Branch',
    'vcs_PullRequest',
    'vcs_PullRequestLabel',
    'vcs_PullRequestFile',
    'vcs_File',
    'vcs_PullRequestReview',
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

    const sourceBranch = this.collectBranch(pr.headRefName, pr.headRepository);
    const targetBranch = this.collectBranch(pr.baseRefName, pr.baseRepository);
    // Ensure if we fail to get branch info we do not overwrite the previous branch info
    // since we should always have branches for a PR
    const branchInfo = omitBy({sourceBranch, targetBranch}, isNil);

    const repoKey = GitHubCommon.repoKey(
      pr.org,
      pr.repo,
      this.streamName.source
    );

    pr.files.forEach((file) => {
      this.fileCollector.collectFile(file.path, repoKey);
    });

    let reviewCommentCount = 0;
    pr.reviews.forEach((review) => {
      reviewCommentCount += review.comments.totalCount;
      this.collectUser(review.author);
    });

    const requestedReviewers = this.collectReviewRequestReviewers(
      pr.reviewRequests
    );

    const prKey = GitHubCommon.pullRequestKey(
      pr.number,
      pr.org,
      pr.repo,
      this.streamName.source
    );

    return [
      {
        model: 'vcs_PullRequest',
        record: {
          ...prKey,
          title: pr.title,
          description: Utils.cleanAndTruncate(pr.body),
          state,
          htmlUrl: pr.url,
          createdAt: Utils.toDate(pr.createdAt),
          updatedAt: Utils.toDate(pr.updatedAt),
          mergedAt: Utils.toDate(pr.mergedAt),
          readyForReviewAt,
          commitCount: pr.commits.totalCount,
          commentCount: pr.comments.totalCount + reviewCommentCount,
          diffStats: {
            linesAdded: pr.additions,
            linesDeleted: pr.deletions,
            filesChanged: pr.changedFiles,
          },
          author: pr.author
            ? {uid: pr.author.login, source: this.streamName.source}
            : null,
          mergeCommit: pr.mergeCommit
            ? {
                repository: repoKey,
                sha: pr.mergeCommit.oid,
                uid: pr.mergeCommit.oid,
              }
            : null,
          ...branchInfo,
        },
      },
      ...pr.labels.map((label) => ({
        model: 'vcs_PullRequestLabel',
        record: {
          pullRequest: prKey,
          label: {name: label.name},
        },
      })),
      ...pr.files.map((file) => ({
        model: 'vcs_PullRequestFile',
        record: {
          pullRequest: prKey,
          file: {uid: file.path, repository: repoKey},
          additions: file.additions,
          deletions: file.deletions,
        },
      })),
      ...pr.reviews.map((review) => ({
        model: 'vcs_PullRequestReview',
        record: {
          number: review.databaseId,
          uid: review.databaseId.toString(),
          htmlUrl: review.url,
          pullRequest: prKey,
          reviewer: review.author
            ? {uid: review.author.login, source: this.streamName.source}
            : null,
          state: getReviewState(review.state),
          submittedAt: Utils.toDate(review.submittedAt),
        },
      })),
      ...requestedReviewers.map((reviewer) => ({
        model: 'vcs_PullRequestReviewRequest',
        record: {
          pullRequest: prKey,
          requestedReviewer: {uid: reviewer, source: this.streamName.source},
        },
      })),
    ];
  }

  // Collects users and returns a list containing reviewers login
  private collectReviewRequestReviewers(
    reviewRequests: PullRequestReviewRequest[]
  ): string[] {
    const reviewers: Set<string> = new Set<string>();

    reviewRequests.forEach((reviewRequest) => {
      const {requestedReviewer} = reviewRequest;

      if (
        requestedReviewer.type === 'Team' &&
        requestedReviewer.members?.nodes
      ) {
        requestedReviewer.members.nodes.forEach((member) =>
          this.addReviewer(reviewers, member)
        );
      } else if (
        requestedReviewer.type === 'User' ||
        requestedReviewer.type === 'Mannequin'
      ) {
        this.addReviewer(reviewers, requestedReviewer);
      }
    });

    return Array.from(reviewers.values());
  }

  private addReviewer(reviewers: Set<string>, reviewer: PartialUser): void {
    reviewers.add(reviewer.login);
    this.collectUser(reviewer);
  }

  async onProcessingComplete(
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    return [
      ...this.convertBranches(),
      ...this.convertUsers(),
      ...this.fileCollector.convertFiles(),
    ];
  }

  private collectBranch(
    branchName: string,
    branchRepo: PullRequest['baseRepository'] | PullRequest['headRepository']
  ): BranchKey | null {
    if (!branchName || !branchRepo?.name || !branchRepo?.owner?.login) {
      return null;
    }

    const key = branchKey(branchName, branchRepo, this.streamName.source);
    const keyStr = branchKeyToString(key);

    if (!this.collectedBranches.has(keyStr)) {
      this.collectedBranches.set(keyStr, key);
    }

    return key;
  }

  private convertBranches(): DestinationRecord[] {
    return Array.from(this.collectedBranches.values()).map((branch) => ({
      model: 'vcs_Branch',
      record: branch,
    }));
  }
}

function branchKey(
  branchName: string,
  branchRepo: PullRequest['baseRepository'] | PullRequest['headRepository'],
  source: string
): BranchKey {
  return {
    uid: branchName,
    name: branchName,
    repository: GitHubCommon.repoKey(
      branchRepo.owner.login,
      branchRepo.name,
      source
    ),
  };
}

function branchKeyToString(branchKey: BranchKey): string {
  return `${branchKey.repository.organization.uid}/${branchKey.repository.name}/${branchKey.name}`;
}

function getReviewState(state: string): ReviewState {
  const reviewStates = [
    'approved',
    'commented',
    'changes_requested',
    'dismissed',
  ];
  return reviewStates.includes(toLower(state))
    ? {category: upperFirst(camelCase(state)), detail: state}
    : {category: 'Custom', detail: state};
}
