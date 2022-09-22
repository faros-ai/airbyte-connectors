import {AirbyteRecord} from 'faros-airbyte-cdk';
import {
  PullRequest,
  selfHRef,
} from 'faros-airbyte-common/lib/bitbucket-server/types';
import {Utils} from 'faros-feeds-sdk';

import {CategoryRef} from '../bitbucket/common';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {BitbucketServerCommon, BitbucketServerConverter} from './common';

enum PullRequestStateCategory {
  CLOSED = 'Closed',
  MERGED = 'Merged',
  OPEN = 'Open',
  CUSTOM = 'Custom',
}

export class PullRequests extends BitbucketServerConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_User',
    'vcs_PullRequest',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const pr = record.record.data as PullRequest;
    const res: DestinationRecord[] = [];
    const [project, repo] =
      pr.computedProperties.repository.fullName.split('/');
    const repoRef = {
      organization: {uid: project.toLowerCase(), source},
      uid: repo.toLowerCase(),
      name: repo.toLowerCase(),
    };
    const user = BitbucketServerCommon.vcsUserNew(pr.author.user, source);
    if (!user) return res;
    res.push(user);
    res.push({
      model: 'vcs_PullRequest',
      record: {
        repository: repoRef,
        number: pr.id,
        uid: pr.id.toString(),
        title: pr.title,
        description: pr.description,
        state: prState(pr.state),
        htmlUrl: selfHRef(pr.links),
        createdAt: Utils.toDate(pr.createdDate),
        updatedAt: Utils.toDate(pr.updatedDate),
        commentCount: pr.properties.commentCount,
        author: {uid: pr.author.user.slug, source},
      },
    });
    return res;
  }
}

function prState(state: string): CategoryRef {
  const stateLower = state?.toLowerCase();
  switch (stateLower) {
    case 'open':
      return {category: PullRequestStateCategory.OPEN, detail: stateLower};
    case 'merged':
      return {category: PullRequestStateCategory.MERGED, detail: stateLower};
    case 'superseded':
    case 'declined':
      return {category: PullRequestStateCategory.CLOSED, detail: stateLower};
    default:
      return {category: PullRequestStateCategory.CUSTOM, detail: stateLower};
  }
}
