import {AirbyteRecord} from 'cdk';
import {Utils} from 'faros-feeds-sdk/lib';
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
    'tms_TaskAssignment',
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

    if (pr.author) {
      res.push(GithubCommon.vcs_User(pr.author, source));
    }

    const state = prStates.includes(pr.state.toLowerCase())
      ? {category: upperFirst(camelCase(pr.state)), detail: pr.state}
      : {category: 'Custom', detail: pr.state};

    // TODO: figure out how to get count of pr and review comment count
    // const reviewCommentCount = 0;
    // const commentCount = pr.comments.totalCount + reviewCommentCount;
    const commentCount = 0;

    // TODO: figure out how to get commit count
    // const commitCount = pr.commits.totalCount
    const commitCount = 0;

    // TODO: figure out how to get diff stats
    // const diffStats = {
    //   linesAdded: pr.additions,
    //   linesDeleted: pr.deletions,
    //   filesChanged: pr.changedFiles,
    // };
    const diffStats = undefined;

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
        commitCount,
        commentCount,
        diffStats,
        author: pr.author ? {uid: pr.author.login, source} : null,
        mergeCommit,
        repository,
      },
    });

    return res;
  }
}
