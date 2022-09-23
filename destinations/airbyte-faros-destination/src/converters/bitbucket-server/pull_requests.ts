import {AirbyteRecord} from 'faros-airbyte-cdk';
import {PullRequest, selfHRef} from 'faros-airbyte-common/bitbucket-server';
import {Utils} from 'faros-feeds-sdk';

import {CategoryRef} from '../bitbucket/common';
import {DestinationModel, DestinationRecord} from '../converter';
import {BitbucketServerConverter} from './common';

enum PullRequestStateCategory {
  CLOSED = 'Closed',
  MERGED = 'Merged',
  OPEN = 'Open',
  CUSTOM = 'Custom',
}

export class PullRequests extends BitbucketServerConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_PullRequest',
  ];

  id(record: AirbyteRecord): string {
    const pr = record?.record?.data as PullRequest;
    return `${pr.computedProperties.repository.fullName};${pr.id}`;
  }

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const pr = record.record.data as PullRequest;
    const res: DestinationRecord[] = [];
    const [project, repo] =
      pr.computedProperties.repository.fullName.split('/');
    const repoRef = this.vcsRepoRef(project, repo);
    const {record: user, ref: author} = this.vcsUser(pr.author.user);

    if (!user) return res;

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
        author,
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
