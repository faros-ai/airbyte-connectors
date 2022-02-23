import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';
import {camelCase, toLower, upperFirst} from 'lodash';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GithubCommon, RepositoryKey} from './common';
import {GithubConverter} from './common';

// Github PR states
const prStates = ['closed', 'merged', 'open'];

export class GithubPullRequests extends GithubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_PullRequest',
    'vcs_User',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const pr = record.record.data;
    const res: DestinationRecord[] = [];

    const repository: RepositoryKey = {
      name: toLower(pr.base.repo.name),
      uid: toLower(pr.base.repo.name),
      organization: {uid: toLower(pr.base.repo.owner.login), source},
    };

    const mergeCommit = pr.merge_commit_sha
      ? {repository, sha: pr.merge_commit_sha, uid: pr.merge_commit_sha}
      : null;

    let author: DestinationRecord | undefined = undefined;
    if (pr.user) {
      author = GithubCommon.vcs_User(pr.user, source);
      res.push(author);
    }

    const state = prStates.includes(pr.state.toLowerCase())
      ? {category: upperFirst(camelCase(pr.state)), detail: pr.state}
      : {category: 'Custom', detail: pr.state};

    res.push({
      // We are explicitly passing __Upsert command here with at := 0,
      // to allow updating PR stats from pull_request_stats stream
      // in the same revision
      model: 'vcs_PullRequest__Upsert',
      record: {
        at: 0,
        data: {
          number: pr.number,
          uid: pr.number.toString(),
          title: pr.title,
          state,
          htmlUrl: pr.url,
          createdAt: Utils.toDate(pr.created_at),
          updatedAt: Utils.toDate(pr.updated_at),
          mergedAt: Utils.toDate(pr.merged_at),
          author: author ? {uid: author.record.uid, source} : null,
          mergeCommit,
          repository,
        },
      },
    });

    return res;
  }
}
