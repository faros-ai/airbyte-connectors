import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';
import {camelCase, toLower, upperFirst} from 'lodash';

import {Converter, DestinationModel, DestinationRecord} from '../converter';
import {GithubCommon, RepositoryKey} from './common';

// Github PR states
const prStates = ['closed', 'merged', 'open'];

export class GithubPullRequests extends Converter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_PullRequest',
    'vcs_User',
  ];

  convert(record: AirbyteRecord): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const pr = record.record.data;
    const res: DestinationRecord[] = [];

    const repository: RepositoryKey = {
      name: toLower(pr.base.repo.name),
      organization: {uid: toLower(pr.base.repo.owner.login), source},
    };

    const mergeCommit = pr.merge_commit_sha
      ? {repository, sha: pr.merge_commit_sha}
      : null;

    let author: DestinationRecord | undefined = undefined;
    if (pr.author ?? pr.user) {
      author = GithubCommon.vcs_User(pr.author ?? pr.user, source);
      res.push(author);
    }

    const state = prStates.includes(pr.state.toLowerCase())
      ? {category: upperFirst(camelCase(pr.state)), detail: pr.state}
      : {category: 'Custom', detail: pr.state};

    res.push({
      model: 'vcs_PullRequest',
      record: {
        number: pr.number,
        title: pr.title,
        state,
        htmlUrl: pr.url,
        createdAt: Utils.toDate(pr.created_at),
        updatedAt: Utils.toDate(pr.updated_at),
        mergedAt: Utils.toDate(pr.merged_at),
        author: author ? {uid: author.record.uid, source} : null,
        mergeCommit,
        repository,
        // PR stats are set from pull_request_stats stream
      },
    });

    return res;
  }
}
