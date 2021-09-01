import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';
import {camelCase, toLower, upperFirst} from 'lodash';

import {
  Converter,
  DestinationModel,
  DestinationRecord,
  StreamName,
} from '../converter';
import {GithubCommon} from './common';

// Github PR states
const prStates = ['closed', 'merged', 'open'];

export class GithubPullRequests implements Converter {
  readonly streamName = new StreamName('github', 'pull_requests');
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_PullRequest',
    'vcs_User',
  ];

  convert(record: AirbyteRecord): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const pr = record.record.data;
    const res: DestinationRecord[] = [];

    const repository = {
      name: toLower(pr.base.repo.name),
      organization: {uid: toLower(pr.base.repo.owner.login), source},
    };

    const mergeCommit = pr.mergeCommit
      ? {repository, sha: pr.mergeCommit.oid}
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
        createdAt: Utils.toDate(pr.createdAt),
        updatedAt: Utils.toDate(pr.updatedAt),
        mergedAt: Utils.toDate(pr.mergedAt),
        author: author ? {uid: author.record.uid, source} : null,
        mergeCommit,
        repository,
        // Skipping PR stats here. They are set in pull_request_stats stream
        commitCount: 0,
        commentCount: 0,
        diffStats: undefined,
      },
    });

    return res;
  }
}
