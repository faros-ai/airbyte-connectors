import {AirbyteRecord} from 'faros-airbyte-cdk';
import {PullRequest, selfHRef} from 'faros-airbyte-common/bitbucket-server';
import {Utils} from 'faros-js-client';

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
    'vcs_Membership',
    'vcs_PullRequest',
    'vcs_User',
  ];

  id(record: AirbyteRecord): string {
    const pr = record?.record?.data as PullRequest;
    return `${pr.computedProperties.repository.fullName};${pr.id}`;
  }

  projectKeysByUser: Record<string, Set<string>> = {};

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const pr = record.record.data as PullRequest;
    const res: DestinationRecord[] = [];
    const [project, repo] =
      pr.computedProperties.repository.fullName.split('/');
    const repoRef = this.vcsRepoKey(project, repo);
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

    if (!this.projectKeysByUser[author.uid]) {
      res.push(user);
      this.projectKeysByUser[author.uid] = new Set();
    }
    const projectKeys = this.projectKeysByUser[author.uid];
    const projectKey = pr.toRef?.repository?.project?.key;
    if (projectKey && !projectKeys.has(projectKey)) {
      res.push({
        model: 'vcs_Membership',
        record: {
          user: author,
          organization: this.vcsOrgKey(projectKey),
        },
      });
      projectKeys.add(projectKey);
    }

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
