import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk/lib';
import {uniq} from 'lodash';

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
  ids: string[];
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
      revision.repository,
      source
    );
    if (!repository) return res;

    const revisionUid = revision.id.toString();
    const pullRequest = {repository, number: revision.id, uid: revisionUid};

    const state = PhabricatorCommon.vcs_PullRequestReviewState(
      transaction.type
    );

    if (state.category !== 'Custom') {
      const submittedAt = transaction.dateCreated
        ? Utils.toDate(transaction.dateCreated * 1000)
        : null;

      res.push({
        model: 'vcs_PullRequestReview',
        record: {
          number: transactionId,
          uid: transactionId.toString(),
          pullRequest,
          reviewer: {uid: transaction.authorPHID, source},
          state,
          submittedAt,
        },
      });
    }

    // Count all unique commits for each revision
    const current = this.commitsCountByPR.get(revisionUid)?.ids ?? [];
    const newVals = transaction?.fields?.commitPHIDs ?? [];
    this.commitsCountByPR.set(revisionUid, {
      pullRequest,
      ids: uniq(current.concat(newVals)),
    });

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

    for (const v of this.commitsCountByPR.values()) {
      res.push({
        model: 'vcs_PullRequest__Update',
        record: {
          at: Date.now(),
          where: v.pullRequest,
          mask: ['commitCount'],
          patch: {
            commitCount: v.ids.length,
          },
        },
      });
    }
    for (const v of this.commentsCountByPR.values()) {
      res.push({
        model: 'vcs_PullRequest__Update',
        record: {
          at: Date.now(),
          where: v.pullRequest,
          mask: ['commentCount'],
          patch: {
            commentCount: v.count,
          },
        },
      });
    }
    return res;
  }
}
