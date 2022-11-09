import {AirbyteRecord} from 'faros-airbyte-cdk';
import {
  PullRequest,
  selfHRef,
  User,
} from 'faros-airbyte-common/bitbucket-server';
import {Utils} from 'faros-feeds-sdk';

import {CategoryRef} from '../bitbucket/common';
import {UserKey} from '../common/vcs';
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

  users: Record<
    string,
    {record: DestinationRecord; ref: UserKey; projectKeys: Set<string>}
  > = {};

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

    if (!this.users[author.uid]) {
      this.users[author.uid] = {
        record: user,
        ref: author,
        projectKeys: new Set(),
      };
    }
    const projectKey = pr.toRef?.repository?.project?.key;
    if (projectKey) {
      this.users[author.uid].projectKeys.add(projectKey);
    }

    return res;
  }

  override async onProcessingComplete(): Promise<
    ReadonlyArray<DestinationRecord>
  > {
    const res: DestinationRecord[] = [];
    for (const {record, ref, projectKeys} of Object.values(this.users)) {
      res.push(record);
      for (const projectKey of projectKeys) {
        res.push({
          model: 'vcs_Membership',
          record: {
            user: ref,
            organization: this.vcsOrgKey(projectKey),
          },
        });
      }
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
