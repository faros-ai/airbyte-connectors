import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {
  Converter,
  DestinationModel,
  DestinationRecord,
  StreamContext,
} from '../converter';
import {PhabricatorCommon} from './common';

export class PhabricatorCommits extends Converter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_BranchCommitAssociation',
    'vcs_Commit',
  ];

  id(record: AirbyteRecord): any {
    return record?.record?.data?.fields?.identifier;
  }

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const commit = record.record.data;
    const res: DestinationRecord[] = [];
    const sha = commit.fields?.identifier;
    const repository = PhabricatorCommon.repositoryKey(
      commit.repository,
      source
    );
    if (!sha || !repository) return res;

    const author = commit.fields?.author;

    res.push({
      model: 'vcs_Commit',
      record: {
        sha,
        message: commit.fields?.message,
        author: author?.userPHID ? {uid: author.userPHID, source} : null,
        htmlUrl: null,
        createdAt: author?.epoch ? Utils.toDate(author?.epoch) : null,
        repository,
        source,
      },
    });

    // TODO: figure out how to get the actual commit branch (hopefully it's possible)
    // Until then we assume the default repository branch for all commits
    const branch = commit.repository.fields?.defaultBranch;
    if (branch) {
      res.push({
        model: 'vcs_BranchCommitAssociation',
        record: {
          commit: {sha, repository},
          branch: {name: branch, repository},
        },
      });
    }

    return res;
  }
}
