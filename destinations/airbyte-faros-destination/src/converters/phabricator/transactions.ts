import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk/lib';

import {
  DestinationModel,
  DestinationRecord,
  StreamContext,
  StreamName,
} from '../converter';
import {PhabricatorCommon, PhabricatorConverter} from './common';

export class Transactions extends PhabricatorConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [];

  private readonly revisionReviewTypes = [
    'accept',
    'accepted',
    'comment',
    'commented',
    'reject',
    'rejected',
    'request-changes',
  ];

  private readonly revisionsStream = new StreamName('phabricator', 'revisions');

  override get dependencies(): ReadonlyArray<StreamName> {
    return [this.revisionsStream];
  }

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const transaction = record.record.data;
    const transactionId = transaction.id;
    const res: DestinationRecord[] = [];

    const revisionsStream = this.revisionsStream.asString;
    const revisionRecord = ctx.get(revisionsStream, transaction.objectPHID);
    const revision = revisionRecord?.record?.data;

    if (!revision) return res;

    const repository = PhabricatorCommon.repositoryKey(
      revision.repository,
      source
    );

    if (!repository) return res;

    const pullRequest = {
      repository,
      number: revision.id,
      uid: revision.id.toString(),
    };

    if (!this.revisionReviewTypes.includes(transaction.type)) return res;

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
        state: PhabricatorCommon.vcs_PullRequestReviewState(transaction.type),
        submittedAt,
      },
    });

    return res;
  }
}
