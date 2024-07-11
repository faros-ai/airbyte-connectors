import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';
import {camelCase, toLower, upperFirst} from 'lodash';

import {RepoKey} from '../common/vcs';
import {DestinationModel, DestinationRecord} from '../converter';
import {GitHubCommon} from './common';
import {GitHubConverter} from './common';

// Github PR states
const prStates = ['closed', 'merged', 'open'];

export class PullRequests extends GitHubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_PullRequest',
    'vcs_User',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const pr = record.record.data;
    const res: DestinationRecord[] = [];

    const repository = GitHubCommon.repoKey(
      pr.base.repo.owner.login,
      pr.base.repo.name,
      source
    );

    const mergeCommit = pr.merge_commit_sha
      ? {repository, sha: pr.merge_commit_sha, uid: pr.merge_commit_sha}
      : null;

    let author: DestinationRecord | undefined = undefined;
    if (pr.user) {
      author = GitHubCommon.vcs_User(pr.user, source);
      if (author) {
        res.push(author);
      }
    }

    const stateDetail = pr?.draft ? 'DRAFT' : pr.state;
    const state = prStates.includes(pr.state.toLowerCase())
      ? {category: upperFirst(camelCase(pr.state)), detail: stateDetail}
      : {category: 'Custom', detail: stateDetail};

    res.push({
      model: 'vcs_PullRequest',
      record: {
        number: pr.number,
        uid: pr.number.toString(),
        title: pr.title,
        description: pr.body?.substring(0, GitHubCommon.MAX_DESCRIPTION_LENGTH),
        state,
        htmlUrl: pr.url,
        createdAt: Utils.toDate(pr.created_at),
        updatedAt: Utils.toDate(pr.updated_at),
        mergedAt: Utils.toDate(pr.merged_at),
        author: author ? {uid: author.record.uid, source} : null,
        mergeCommit,
        repository,
      },
    });

    return res;
  }
}
