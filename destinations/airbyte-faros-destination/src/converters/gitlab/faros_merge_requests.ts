import {AirbyteRecord} from 'faros-airbyte-cdk';
import {FarosMergeRequestOutput} from 'faros-airbyte-common/gitlab';
import {Utils} from 'faros-js-client';
import {toLower} from 'lodash';

import {BranchCollector} from '../common/vcs';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GitlabConverter} from './common';

interface DiffStatsSummary {
  additions: number;
  deletions: number;
  fileCount: number;
}

export class FarosMergeRequests extends GitlabConverter {
  private readonly branchCollector = new BranchCollector();

  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_PullRequest',
    'vcs_PullRequestComment',
    'vcs_PullRequestReview',
    'vcs_PullRequestLabel',
    'vcs_Label',
    'vcs_Branch',
  ];

  id(record: AirbyteRecord): string {
    const mergeRequest = record?.record?.data as FarosMergeRequestOutput;
    return `${mergeRequest?.group_id}_${mergeRequest?.project_path}_${mergeRequest?.iid}`;
  }

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const mergeRequest = record.record.data as FarosMergeRequestOutput;
    const source = this.streamName.source;

    // Create organization and repository keys following faros_projects pattern
    const organization = {
      uid: mergeRequest.group_id,
      source,
    };

    const projectName = toLower(mergeRequest.project_path);
    const repository = {
      name: projectName,
      uid: projectName,
      organization,
    };

    const res: DestinationRecord[] = [];

    // Build source repository for cross-project MRs
    const sourceRepository =
      mergeRequest.sourceProjectId === mergeRequest.targetProjectId
        ? repository
        : {
            name: mergeRequest.sourceProject?.path?.toLowerCase(),
            uid: mergeRequest.sourceProject?.path?.toLowerCase(),
            organization: {
              uid: mergeRequest.sourceProject?.group?.id?.toLowerCase(),
              source,
            },
          };

    const sourceBranch = this.branchCollector.collectBranch(
      mergeRequest.sourceBranch,
      sourceRepository
    );
    const targetBranch = this.branchCollector.collectBranch(
      mergeRequest.targetBranch,
      repository
    );

    // Create main vcs_PullRequest record
    res.push({
      model: 'vcs_PullRequest',
      record: {
        number: mergeRequest.iid,
        uid: mergeRequest.iid.toString(),
        title: mergeRequest.title,
        state: this.pullRequestState(mergeRequest.state),
        htmlUrl: mergeRequest.webUrl,
        createdAt: Utils.toDate(mergeRequest.createdAt),
        updatedAt: Utils.toDate(mergeRequest.updatedAt),
        mergedAt: Utils.toDate(mergeRequest.mergedAt),
        closedAt: Utils.toDate(mergeRequest.closedAt),
        commentCount: mergeRequest.userNotesCount,
        commitCount: mergeRequest.commitCount,
        diffStats: mergeRequest.diffStatsSummary
          ? {
              linesAdded: (mergeRequest.diffStatsSummary as DiffStatsSummary)
                .additions,
              linesDeleted: (mergeRequest.diffStatsSummary as DiffStatsSummary)
                .deletions,
              filesChanged: (mergeRequest.diffStatsSummary as DiffStatsSummary)
                .fileCount,
            }
          : null,
        author: mergeRequest.author_username
          ? {uid: mergeRequest.author_username, source}
          : null,
        mergeCommit: mergeRequest.mergeCommitSha
          ? {
              repository,
              sha: mergeRequest.mergeCommitSha,
              uid: mergeRequest.mergeCommitSha,
            }
          : null,
        repository,
        sourceBranch,
        sourceBranchName: mergeRequest.sourceBranch,
        targetBranch,
        targetBranchName: mergeRequest.targetBranch,
      },
    });

    // Create vcs_PullRequestComment records from notes
    const pullRequest = {
      repository,
      number: mergeRequest.iid,
      uid: mergeRequest.iid.toString(),
    };

    if (mergeRequest.notes) {
      for (const note of mergeRequest.notes) {
        const numericId = this.extractIdFromGid(String(note.id));

        res.push({
          model: 'vcs_PullRequestComment',
          record: {
            number: numericId,
            uid: note.id,
            author: note.author_username
              ? {uid: note.author_username, source}
              : null,
            comment: Utils.cleanAndTruncate(note.body),
            createdAt: Utils.toDate(note.created_at),
            updatedAt: Utils.toDate(note.updated_at),
            pullRequest,
          },
        });

        // Create synthetic vcs_PullRequestReview record for each comment
        // Following the pattern from GitLab feed
        const createdAt = Utils.toDate(note.created_at);
        if (createdAt) {
          const reviewId = createdAt.getTime();
          res.push({
            model: 'vcs_PullRequestReview',
            record: {
              state: {category: 'Commented', detail: 'commented'},
              number: reviewId,
              uid: reviewId.toString(),
              htmlUrl: null,
              pullRequest,
              reviewer: note.author_username
                ? {uid: note.author_username, source}
                : null,
              submittedAt: createdAt,
            },
          });
        }
      }
    }

    // Create vcs_Label and vcs_PullRequestLabel records from labels
    if (mergeRequest.labels) {
      for (const labelName of mergeRequest.labels) {
        // Create vcs_Label record
        res.push({
          model: 'vcs_Label',
          record: {
            name: labelName,
          },
        });

        // Create vcs_PullRequestLabel record
        res.push({
          model: 'vcs_PullRequestLabel',
          record: {
            pullRequest,
            label: {name: labelName},
          },
        });
      }
    }

    return res;
  }

  async onProcessingComplete(
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    return this.branchCollector.convertBranches();
  }

  private extractIdFromGid(gid: string): number | null {
    // Extract numeric ID from GitLab GID format (e.g., gid://gitlab/Note/2559908301)
    // If it's already a number, return it as is
    if (/^\d+$/.test(gid)) {
      return parseInt(gid, 10);
    }

    // Extract the numeric part from GID format
    const parts = gid.split('/');
    const numericPart = parts.pop();
    if (!numericPart) {
      return null;
    }
    const parsed = parseInt(numericPart, 10);

    if (isNaN(parsed)) {
      return null;
    }

    return parsed;
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
        return {category: 'Custom', detail: detail || 'undefined'};
    }
  }
}
