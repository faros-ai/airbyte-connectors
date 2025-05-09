import {AirbyteRecord} from 'faros-airbyte-cdk';
import {
  PullRequest,
  PullRequestReviewRequest,
} from 'faros-airbyte-common/github';
import {Utils} from 'faros-js-client';
import {camelCase, isNil, last, omitBy, toLower, upperFirst} from 'lodash';

import {FLUSH} from '../../common/types';
import {FileCollector, PullRequestKey, RepoKey} from '../common/vcs';
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
  private readonly collectedBranches = new Map<string, BranchKey>();
  private readonly fileCollector = new FileCollector();
  private readonly collectedLabels = new Set<string>();
  private readonly prFileAssoc = new Map<
    string,
    ReadonlyArray<DestinationRecord>
  >();
  private readonly prKeyMap = new Map<string, PullRequestKey>();

  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_Branch',
    'vcs_File',
    'vcs_Label',
    'vcs_PullRequest',
    'vcs_PullRequestFile',
    'vcs_PullRequestLabel',
    'vcs_PullRequestReview',
    'vcs_PullRequestReviewRequest',
    'qa_CodeQuality',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const pr = record.record.data as PullRequest;

    const prKey = GitHubCommon.pullRequestKey(
      pr.number,
      pr.org,
      pr.repo,
      this.streamName.source
    );

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
    const branchInfo = omitBy(
      {
        sourceBranch,
        sourceBranchName: pr.headRefName,
        targetBranch,
        targetBranchName: pr.baseRefName,
      },
      isNil
    );

    const repoKey = GitHubCommon.repoKey(
      pr.org,
      pr.repo,
      this.streamName.source
    );

    pr.files.forEach((file) => {
      this.fileCollector.collectFile(file.path, repoKey);
    });

    pr.labels.forEach((label) => {
      this.collectedLabels.add(label.name);
    });

    let reviewCommentCount = 0;
    const reviewSubmissionComments: DestinationRecord[] = [];
    pr.reviews.forEach((review) => {
      reviewCommentCount += review.comments.totalCount;
      if (review.body) {
        reviewSubmissionComments.push({
          model: 'vcs_PullRequestComment',
          record: {
            number: review.databaseId,
            uid: review.databaseId.toString(),
            comment: Utils.cleanAndTruncate(
              review.body,
              GitHubCommon.MAX_DESCRIPTION_LENGTH
            ),
            createdAt: Utils.toDate(review.submittedAt),
            updatedAt: Utils.toDate(review.updatedAt),
            author: review.author
              ? {uid: review.author.login, source: this.streamName.source}
              : null,
            pullRequest: prKey,
          },
        });
      }
      this.collectUser(review.author);
    });

    const requestedReviewers = this.collectReviewRequestReviewers(
      pr.reviewRequests
    );

    const qa_CodeQuality: DestinationRecord[] = [];
    if (pr.coverage) {
      qa_CodeQuality.push({
        model: 'qa_CodeQuality',
        record: {
          uid: pr.coverage.commitSha,
          coverage: {
            category: 'Coverage',
            type: 'Percent',
            name: 'Coverage',
            value: pr.coverage.coveragePercentage,
          },
          createdAt: Utils.toDate(pr.coverage.createdAt),
          pullRequest: prKey,
          commit: {
            sha: pr.coverage.commitSha,
            repository: repoKey,
          },
          repository: repoKey,
        },
      });
    }

    const prKeyStr = `${prKey.repository.organization.uid}/${prKey.repository.uid}/${prKey.number}`;
    this.prKeyMap.set(prKeyStr, prKey);
    this.prFileAssoc.set(
      prKeyStr,
      pr.files.map((file) => ({
        model: 'vcs_PullRequestFile',
        record: {
          pullRequest: prKey,
          file: {uid: file.path, repository: repoKey},
          additions: file.additions,
          deletions: file.deletions,
        },
      }))
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
          commentCount:
            pr.comments.totalCount +
            reviewCommentCount +
            reviewSubmissionComments.length,
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
          requestedReviewer: {uid: reviewer.login, source: this.streamName.source},
          asCodeOwner: reviewer.asCodeOwner,
        },
      })),
      ...reviewSubmissionComments,
      ...qa_CodeQuality,
    ];
  }

  // Collects users and returns a list containing reviewers with login and asCodeOwner status
  private collectReviewRequestReviewers(
    reviewRequests: PullRequestReviewRequest[]
  ): {login: string; asCodeOwner: boolean}[] {
    const reviewers: Map<string, {login: string; asCodeOwner: boolean}> = new Map();

    reviewRequests
      .filter((reviewRequest) => reviewRequest?.requestedReviewer?.type)
      .forEach((reviewRequest) => {
        const {requestedReviewer, asCodeOwner = false} = reviewRequest;

        if (
          requestedReviewer.type === 'Team' &&
          requestedReviewer.members?.nodes
        ) {
          requestedReviewer.members.nodes.forEach((member) =>
            this.addReviewer(reviewers, member, asCodeOwner)
          );
        } else if (
          requestedReviewer.type === 'User' ||
          requestedReviewer.type === 'Mannequin'
        ) {
          this.addReviewer(reviewers, requestedReviewer, asCodeOwner);
        }
      });

    return Array.from(reviewers.values());
  }

  private addReviewer(
    reviewers: Map<string, {login: string; asCodeOwner: boolean}>, 
    reviewer: PartialUser, 
    asCodeOwner: boolean
  ): void {
    const existingReviewer = reviewers.get(reviewer.login);
    // We might see the same reviewer requested as a code owner and as a member of a team (with asCodeOwner = false)
    if (!existingReviewer || (!existingReviewer.asCodeOwner && asCodeOwner)) {
      reviewers.set(reviewer.login, {login: reviewer.login, asCodeOwner});
    }
    this.collectUser(reviewer);
  }

  async onProcessingComplete(
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    return [
      ...this.convertBranches(),
      ...this.convertLabels(),
      ...this.convertUsers(),
      ...this.fileCollector.convertFiles(),
      ...this.convertPRFileAssociations(),
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

  private convertLabels(): DestinationRecord[] {
    return Array.from(this.collectedLabels.values()).map((label) => ({
      model: 'vcs_Label',
      record: {
        name: label,
      },
    }));
  }

  private convertPRFileAssociations(): DestinationRecord[] {
    return [
      ...Array.from(this.prFileAssoc.keys()).map((prKeyStr) => ({
        model: 'vcs_PullRequestFile__Deletion',
        record: {
          flushRequired: false,
          where: {
            pullRequest: this.prKeyMap.get(prKeyStr),
          },
        },
      })),
      FLUSH,
      ...Array.from(this.prFileAssoc.values()).flat(),
    ];
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
