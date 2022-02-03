import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {PhabricatorCommon, PhabricatorConverter} from './common';

export class PhabricatorRevisions extends PhabricatorConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_PullRequest',
    'vcs_PullRequestReview',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const revision = record.record.data;
    const res: DestinationRecord[] = [];
    const repository = PhabricatorCommon.repositoryKey(
      revision.repository,
      source
    );
    if (!repository) return res;

    const state = PhabricatorCommon.vcs_PullRequestState(
      revision.fields?.status
    );
    const createdAt = revision.fields?.dateCreated
      ? Utils.toDate(revision.fields?.dateCreated * 1000)
      : null;
    const updatedAt = revision.fields?.dateModified
      ? Utils.toDate(revision.fields?.dateModified * 1000)
      : null;

    // TODO: figure out how to get the actual mergedAt timestamp for each revision
    const mergedAt = state.category === 'Merged' ? updatedAt : null;

    const author = revision.fields?.authorPHID
      ? {uid: revision.fields?.authorPHID, source}
      : null;

    res.push({
      // We are explicitly passing __Upsert command here with at := 0,
      // to allow updating PR merge commit from commits stream
      // in the same revision
      model: 'vcs_PullRequest__Upsert',
      record: {
        at: 0,
        data: {
          number: revision.id,
          uid: revision.id.toString(),
          title: revision.fields?.title,
          state,
          htmlUrl: revision.fields?.uri,
          createdAt,
          updatedAt,
          mergedAt,
          author,
          repository,
          mergeCommit: null, // merge commit is set from commits stream
        },
      },
    });

    const reviewers = Array.isArray(revision.attachments?.reviewers?.reviewers)
      ? revision.attachments?.reviewers?.reviewers
      : [];
    const pullRequest = {repository, number: revision.id};
    let reviewId = 0;
    for (const reviewer of reviewers) {
      res.push({
        model: 'vcs_PullRequestReview',
        record: {
          number: reviewId,
          uid: reviewId.toString(),
          pullRequest,
          reviewer: {uid: reviewer.reviewerPHID, source},
          state: PhabricatorCommon.vcs_PullRequestReviewState(reviewer?.status),
          // TODO: figure out how to get the actual submittedAt timestamp for each revision
          submittedAt: updatedAt,
        },
      });
      reviewId++;
    }

    return res;
  }
}
