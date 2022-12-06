import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord} from '../converter';
import {PhabricatorCommon, PhabricatorConverter} from './common';

export class Revisions extends PhabricatorConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_PullRequest',
  ];

  async convert(
    record: AirbyteRecord
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
    const author = revision.fields?.authorPHID
      ? {uid: revision.fields?.authorPHID, source}
      : null;

    res.push({
      model: 'vcs_PullRequest',
      record: {
        number: revision.id,
        uid: revision.id.toString(),
        title: revision.fields?.title,
        state,
        htmlUrl: revision.fields?.uri,
        createdAt,
        updatedAt,
        author,
        repository,
        mergedAt: null, // set from commits stream
        mergeCommit: null, // set from commits stream
      },
    });

    return res;
  }
}
