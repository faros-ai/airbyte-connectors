import {AirbyteRecord} from 'faros-airbyte-cdk';
import {User} from 'faros-airbyte-common/github';
import {Utils} from 'faros-js-client';
import {isEmpty, isNil, omitBy, toLower} from 'lodash';
import {Dictionary} from 'ts-essentials';

import {PullRequestKey, RepoKey} from '../common/vcs';
import {Converter, DestinationRecord, StreamContext} from '../converter';

export type PartialUser = Partial<Omit<User, 'type'> & {type: string}>;

export type GitHubConfig = {
  sync_repo_issues?: boolean;
};

/** Common functions shares across GitHub converters */
export class GitHubCommon {
  // Max length for free-form description text fields such as issue body
  static readonly MAX_DESCRIPTION_LENGTH = 1000;
  static readonly DEFAULT_SYNC_REPO_ISSUES = false;

  static vcs_User_with_Membership(
    user: Dictionary<any>,
    source: string
  ): DestinationRecord[] {
    const vcsUser = GitHubCommon.vcs_User(user, source);

    if (!vcsUser) return [];

    const repository = GitHubCommon.parseRepositoryKey(user.repository, source);

    if (!repository) return [vcsUser];

    const vcsMembership = GitHubCommon.vcs_Membership(
      vcsUser.record.uid,
      repository.organization.uid,
      repository.organization.source
    );
    return [vcsUser, vcsMembership];
  }

  static vcs_UserType(user: Dictionary<any>): {
    category: string;
    detail: string;
  } {
    if (!user.type) {
      return {category: 'Custom', detail: 'unknown'};
    }
    const userTypeLower = user.type.toLowerCase();
    switch (userTypeLower) {
      case 'enterpriseuseraccount':
      case 'user':
        return {category: 'User', detail: userTypeLower};
      case 'bot':
        return {category: 'Bot', detail: userTypeLower};
      case 'organization':
        return {category: 'Organization', detail: userTypeLower};
      case 'mannequin':
        return {category: 'Mannequin', detail: userTypeLower};
      default:
        return {category: 'Custom', detail: userTypeLower};
    }
  }

  static vcs_User(
    user: Dictionary<any>,
    source: string
  ): DestinationRecord | undefined {
    // don't create a user w/ undefined uid
    if (!user.login) {
      return undefined;
    }
    const type = GitHubCommon.vcs_UserType(user);
    return {
      model: 'vcs_User',
      record: {
        uid: user.login,
        name: user.name ?? user.login ?? null,
        htmlUrl: user.html_url ?? null,
        type,
        source,
      },
    };
  }

  static vcs_Membership(
    userUid: string,
    org: string,
    source: string
  ): DestinationRecord {
    return {
      model: 'vcs_Membership',
      record: {
        user: {uid: userUid, source},
        organization: {uid: toLower(org), source},
      },
    };
  }

  static tms_User(
    user: Dictionary<any> | undefined,
    source: string
  ): DestinationRecord | undefined {
    if (!user?.login) return undefined;

    return {
      model: 'tms_User',
      record: {
        uid: user.login,
        name: user.name ?? user.login ?? null,
        source,
      },
    };
  }

  static tms_ProjectBoard_with_TaskBoard(
    projectKey: ProjectKey,
    name: string,
    description: string | null,
    createdAt: string | null | undefined,
    updatedAt: string | null | undefined
  ): DestinationRecord[] {
    return [
      {
        model: 'tms_Project',
        record: {
          ...projectKey,
          name: name,
          description: description?.substring(
            0,
            GitHubCommon.MAX_DESCRIPTION_LENGTH
          ),
          createdAt: Utils.toDate(createdAt),
          updatedAt: Utils.toDate(updatedAt),
        },
      },
      {
        model: 'tms_TaskBoard',
        record: {
          ...projectKey,
          name,
        },
      },
      {
        model: 'tms_TaskBoardProjectRelationship',
        record: {
          board: projectKey,
          project: projectKey,
        },
      },
    ];
  }

  static parseRepositoryKey(
    repository: string,
    source: string
  ): undefined | RepoKey {
    if (!repository) return undefined;

    const orgRepo: ReadonlyArray<string> = repository.split('/');
    if (orgRepo.length != 2) return undefined;

    const [organization, repositoryName] = orgRepo;
    return {
      name: toLower(repositoryName),
      uid: toLower(repositoryName),
      organization: {uid: toLower(organization), source},
    };
  }

  static parsePRnumber(pull_request_url: string): number {
    return Utils.parseInteger(
      pull_request_url.substring(pull_request_url.lastIndexOf('/') + 1)
    );
  }

  static cicd_BuildStatus(
    status: string,
    conclusion: string
  ): {
    category: string;
    detail: string;
  } {
    const statusLower = status.toLowerCase();

    switch (statusLower) {
      case 'queued':
        return {category: 'Queued', detail: statusLower};
      case 'in_progress':
        return {category: 'Running', detail: statusLower};
      case 'completed':
        return GitHubCommon.buildStatus(conclusion);
      default:
        return {category: 'Custom', detail: statusLower};
    }
  }

  static repoKey(org: string, repo: string, source: string): RepoKey {
    return {
      uid: toLower(repo),
      name: toLower(repo),
      organization: {
        uid: toLower(org),
        source,
      },
    };
  }

  static pullRequestKey(
    number: number,
    org: string,
    repo: string,
    source: string
  ): PullRequestKey {
    return {
      uid: number.toString(),
      number: number,
      repository: this.repoKey(org, repo, source),
    };
  }

  static vulnerabilityUid(
    org: string,
    repo: string,
    alertType: string,
    number: number
  ): string {
    return `${org}/${repo}/${alertType}/${number}`;
  }

  private static buildStatus(conclusion: string): {
    category: string;
    detail: string;
  } {
    const conclusionLower = conclusion.toLowerCase();

    switch (conclusionLower) {
      case 'success':
        return {category: 'Success', detail: conclusionLower};
      case 'failure':
        return {category: 'Failed', detail: conclusionLower};
      case 'cancelled':
        return {category: 'Canceled', detail: conclusionLower};
      default:
        return {category: 'Custom', detail: conclusionLower};
    }
  }
}

/** Github converter base */
export abstract class GitHubConverter extends Converter {
  source = 'GitHub';

  protected collectedUsers = new Map<string, Array<PartialUser>>();

  /** All Github records should have id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }

  protected githubConfig(ctx: StreamContext): GitHubConfig {
    return ctx.config.source_specific_configs?.github ?? {};
  }

  protected syncRepoIssues(ctx: StreamContext): boolean {
    return (
      this.githubConfig(ctx).sync_repo_issues ??
      GitHubCommon.DEFAULT_SYNC_REPO_ISSUES
    );
  }

  protected collectUser(user: PartialUser) {
    if (!user?.login) return;
    if (!this.collectedUsers.has(user.login)) {
      this.collectedUsers.set(user.login, []);
    }
    this.collectedUsers.get(user.login).push({
      ...user,
      email:
        isEmpty(user.email) || user.email.includes('@users.noreply.github.com')
          ? null
          : user.email,
    });
  }

  protected convertUsers(): DestinationRecord[] {
    const res: DestinationRecord[] = [];
    for (const [login, users] of this.collectedUsers.entries()) {
      const emails = new Set(
        users.map((user) => user.email).filter((email) => !!email)
      );
      for (const email of emails) {
        res.push({
          model: 'vcs_UserEmail',
          record: {
            user: {uid: login, source: this.streamName.source},
            email,
          },
        });
      }
      const orgs = new Set(
        users.map((user) => user.org).filter((org) => !isEmpty(org))
      );
      for (const org of orgs) {
        res.push({
          model: 'vcs_Membership',
          record: {
            user: {uid: login, source: this.streamName.source},
            organization: {uid: toLower(org), source: this.streamName.source},
          },
        });
      }
      const finalUser = this.getFinalUser(users);
      res.push({
        model: 'vcs_User',
        record: omitBy(
          {
            uid: login,
            source: this.streamName.source,
            name: finalUser.name,
            email: finalUser.email,
            htmlUrl: finalUser.html_url,
            type: GitHubCommon.vcs_UserType(finalUser),
          },
          (value) => isNil(value) || isEmpty(value)
        ),
      });
    }
    return res;
  }

  protected convertTMSUsers(): DestinationRecord[] {
    const res: DestinationRecord[] = [];
    for (const [login, users] of this.collectedUsers.entries()) {
      const finalUser = this.getFinalUser(users);
      res.push({
        model: 'tms_User',
        record: omitBy(
          {
            uid: login,
            source: this.streamName.source,
            name: finalUser.name,
          },
          (value) => isNil(value) || isEmpty(value)
        ),
      });
    }
    return res;
  }

  // Replace non-null user attributes to our copy of the user
  // e.g. login, name, email, type, html_url.
  private getFinalUser(users: Array<PartialUser>) {
    const finalUser: PartialUser = {};
    for (const user of users) {
      for (const key in user) {
        if (!finalUser[key] && user[key]) {
          finalUser[key] = user[key];
        }
      }
    }
    return finalUser;
  }
}

export interface ProjectKey {
  uid: string;
  source: string;
}
