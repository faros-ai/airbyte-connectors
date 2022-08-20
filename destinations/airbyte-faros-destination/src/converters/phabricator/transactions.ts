import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';
import {isEmpty, union} from 'lodash';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {PhabricatorCommon, PhabricatorConverter, RepositoryKey} from './common';

type CountForPR = {
  pullRequest: {
    repository: RepositoryKey;
    number: any;
    uid: any;
  };
  count: number;
};

type IdsForPR = {
  pullRequest: {
    repository: RepositoryKey;
    number: any;
    uid: any;
  };
  ids: Set<string>;
};

export class Transactions extends PhabricatorConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_PullRequestReview',
  ];

  private readonly commentsCountByPR = new Map<string, CountForPR>();
  private readonly commitsCountByPR = new Map<string, IdsForPR>();

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const transaction = record.record.data;
    const transactionId = transaction.id;
    const res: DestinationRecord[] = [];

    const revision = transaction?.revision;
    if (!revision) return res;

    const repository = PhabricatorCommon.repositoryKey(
      transaction?.repository,
      source
    );
    if (!repository) return res;

    const revisionUid = revision.id.toString();
    const pullRequest = {repository, number: revision.id, uid: revisionUid};

    const state = PhabricatorCommon.vcs_PullRequestReviewState(
      transaction.type
    );

    const dateCreated = transaction.dateCreated
      ? Utils.toDate(transaction.dateCreated * 1000)
      : null;

    if (state.category !== 'Custom') {
      res.push({
        model: 'vcs_PullRequestReview',
        record: {
          number: transactionId,
          uid: transactionId.toString(),
          pullRequest,
          reviewer: {uid: transaction.authorPHID, source},
          state,
          submittedAt: dateCreated,
        },
      });
    }

    if (
      (state.detail === 'close' || state.detail === 'closed') &&
      !isEmpty(transaction?.fields?.commitPHIDs)
    ) {
      res.push({
        model: 'vcs_PullRequest__Update',
        record: {
          at: Date.now(),
          where: pullRequest,
          mask: ['mergedAt'],
          patch: {mergedAt: dateCreated},
        },
      });
    }

    // Count all unique commits for each revision
    const ids =
      this.commitsCountByPR.get(revisionUid)?.ids ?? new Set<string>();
    const newVals = transaction?.fields?.commitPHIDs ?? [];

    for (const newVal of newVals) {
      ids.add(newVal);
    }
    this.commitsCountByPR.set(revisionUid, {pullRequest, ids});

    // Count all comments for each revision
    if (state.category === 'Commented') {
      const current = this.commentsCountByPR.get(revisionUid)?.count ?? 0;
      const newCount = transaction?.comments?.length ?? 0;
      this.commentsCountByPR.set(revisionUid, {
        pullRequest,
        count: current + newCount,
      });
    }

    return res;
  }

  override async onProcessingComplete(
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const res: DestinationRecord[] = [];

    const allKeys = union(
      Array.from(this.commitsCountByPR.keys()),
      Array.from(this.commentsCountByPR.keys())
    );

    for (const id of allKeys) {
      const commits = this.commitsCountByPR.get(id);
      const comments = this.commentsCountByPR.get(id);

      res.push({
        model: 'vcs_PullRequest__Update',
        record: {
          at: Date.now(),
          where: commits?.pullRequest ?? comments?.pullRequest,
          mask: ['commitCount', 'commentCount'],
          patch: {
            commitCount: commits?.ids?.size ?? null,
            commentCount: comments?.count ?? null,
          },
        },
      });
    }

    return res;
  }
}
