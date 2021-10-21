import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {PhabricatorCommon, PhabricatorConverter} from './common';

export class PhabricatorRevisions extends PhabricatorConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_PullRequest',
    'vcs_PullRequestReview',
  ];

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
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
    const mergedAt = state.category === 'Merged' ? updatedAt : null;

    const author = revision.fields?.authorPHID
      ? {uid: revision.fields?.authorPHID, source}
      : null;

    res.push({
      model: 'vcs_PullRequest',
      record: {
        number: revision.id,
        title: revision.fields?.title,
        state,
        htmlUrl: revision.fields?.uri,
        createdAt,
        updatedAt,
        mergedAt,
        author,
        // TODO: figure out how to get the merge commit for a revision
        mergeCommit: null,
        repository,
      },
    });

    const reviewers = Array.isArray(revision.attachments?.reviewers?.reviewers)
      ? revision.attachments?.reviewers?.reviewers
      : [];
    const pullRequest = {repository, number: revision.id};
    let reviewId = 0;
    for (const reviewer of reviewers) {
      // TODO: figure out how to get the actual submittedAt timestamp for each review
      const submittedAt = updatedAt;
      res.push({
        model: 'vcs_PullRequestReview',
        record: {
          number: reviewId,
          pullRequest,
          reviewer: {uid: reviewer.reviewerPHID, source},
          state: PhabricatorCommon.vcs_PullRequestReviewState(reviewer?.status),
          submittedAt,
        },
      });
      reviewId++;
    }

    return res;
  }
}
