import {AirbyteRecord} from 'faros-airbyte-cdk';
import {PullRequest} from 'faros-airbyte-common/github';
import {Utils} from 'faros-js-client';
import {camelCase, isNil, last, omitBy, toLower, upperFirst} from 'lodash';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GitHubConverter} from './common';

type RepoKey = {
  name: string;
  organization: {
    uid: string;
    source: string;
  };
};

type BranchKey = {
  name: string;
  repository: RepoKey;
};

export class FarosPullRequests extends GitHubConverter {
  private collectedBranches = new Map<string, BranchKey>();

  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_PullRequest',
    'vcs_Branch',
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

    return [
      {
        model: 'vcs_PullRequest',
        record: {
          repository: repoKey(pr.org, pr.repo, this.streamName.source),
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
          commentCount: pr.comments.totalCount,
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
          ...branchInfo,
        },
      },
    ];
  }

  async onProcessingComplete(
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    return [...this.convertBranches(), ...this.convertUsers()];
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
    return Array.from(this.collectedBranches.values()).map((branchKey) => ({
      model: 'vcs_Branch',
      record: branchKey,
    }));
  }
}

function repoKey(org: string, repo: string, source: string): RepoKey {
  return {
    name: toLower(repo),
    organization: {
      uid: toLower(org),
      source,
    },
  };
}

function branchKey(
  branchName: string,
  branchRepo: PullRequest['baseRepository'] | PullRequest['headRepository'],
  source: string
): BranchKey {
  return {
    name: branchName,
    repository: repoKey(branchRepo.owner.login, branchRepo.name, source),
  };
}

function branchKeyToString(branchKey: BranchKey): string {
  return `${branchKey.repository.organization.uid}/${branchKey.repository.name}/${branchKey.name}`;
}
