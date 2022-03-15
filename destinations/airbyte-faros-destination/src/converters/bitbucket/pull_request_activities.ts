import {AirbyteLogger, AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {BitbucketCommon, BitbucketConverter} from './common';
import {PRActivity, User} from './types';

enum PullRequestReviewStateCategory {
  APPROVED = 'Approved',
  COMMENTED = 'Commented',
  CHANGES_REQUESTS = 'ChangesRequested',
  DISMISSED = 'Dismissed',
  CUSTOM = 'Custom',
}

export class PullRequestActivities extends BitbucketConverter {
  readonly logger = new AirbyteLogger();

  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_User',
    'vcs_PullRequestComment',
    'vcs_PullRequestReview',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const prActivity = record.record.data as PRActivity;
    const res: DestinationRecord[] = [];

    const change =
      prActivity?.comment ??
      prActivity?.approval ??
      prActivity?.changesRequested ??
      prActivity?.update;

    const date = Utils.toDate(
      change?.date ?? change?.updated_on ?? change?.created_on
    );

    const state = this.reviewState(prActivity);
    if (!change || !state) return res;

    const id = change?.id ?? date?.getUTCMilliseconds();

    if (!id) {
      this.logger.debug(
        `Ignored activity for pull request ${
          prActivity.pullRequest.id
        } in repo ${
          prActivity.pullRequest.repositorySlug
        }, since it has no id: ${JSON.stringify(change)}`
      );
      return res;
    }

    let reviewer = null;
    const user: User = change?.author ?? change?.user;
    if (user?.accountId) {
      const userRecord = BitbucketCommon.vcsUser(user, source);
      if (userRecord) {
        res.push(userRecord);
        reviewer = {uid: user.accountId, source};
      }
    }
    const orgRef = {
      uid: prActivity?.pullRequest?.workspace?.toLowerCase(),
      source,
    };
    const repoRef = {
      name: prActivity?.pullRequest?.repositorySlug?.toLowerCase(),
      organization: orgRef,
    };
    if (!orgRef.uid || repoRef.name) {
      return res;
    }

    const pullRequest = {
      repository: repoRef,
      number: prActivity.pullRequest.id,
      uid: prActivity.pullRequest.id.toString(),
    };

    if (prActivity?.comment && (prActivity?.comment as any)?.inline) {
      res.push({
        model: 'vcs_PullRequestComment',
        record: {
          number: id,
          uid: id.toString(),
          comment: change?.content?.raw,
          createdAt: Utils.toDate(change?.created_on),
          updatedAt: Utils.toDate(change?.updated_on),
          author: reviewer,
          pullRequest,
        },
      });
    } else {
      res.push({
        model: 'vcs_PullRequestReview',
        record: {
          number: id,
          uid: id.toString(),
          htmlUrl: change?.pull_request?.links?.html?.href,
          pullRequest,
          reviewer,
          state,
          submittedAt: date,
        },
      });
    }

    return res;
  }

  reviewState(
    prActivity: PRActivity
  ): {category: string; detail: string | null} | undefined {
    // We are only considering a subset of activities on the PR and ignoring everything else
    if (prActivity?.comment)
      return {category: PullRequestReviewStateCategory.COMMENTED, detail: null};
    if (prActivity?.approval)
      return {category: PullRequestReviewStateCategory.APPROVED, detail: null};
    if (prActivity?.changesRequested)
      return {
        category: PullRequestReviewStateCategory.CHANGES_REQUESTS,
        detail: null,
      };
    if (prActivity?.update && prActivity?.update?.state === 'DECLINED')
      return {category: PullRequestReviewStateCategory.DISMISSED, detail: null};
    return {category: PullRequestReviewStateCategory.CUSTOM, detail: null};
  }
}
