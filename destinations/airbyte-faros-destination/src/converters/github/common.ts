import {AirbyteRecord} from 'faros-airbyte-cdk';
import {User} from 'faros-airbyte-common/github';
import {Utils} from 'faros-js-client';
import {isEmpty, isNil, omitBy, toLower} from 'lodash';
import {Dictionary} from 'ts-essentials';

import {RepoKey} from '../common/vcs';
import {Converter, DestinationRecord} from '../converter';

/** Common functions shares across GitHub converters */
export class GitHubCommon {
  // Max length for free-form description text fields such as issue body
  static readonly MAX_DESCRIPTION_LENGTH = 1000;

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

  /** All Github records should have id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }

  protected convertUser(user: User): DestinationRecord[] {
    const res: DestinationRecord[] = [];
    if (
      !isEmpty(user.email) &&
      !user.email.includes('@users.noreply.github.com')
    ) {
      res.push({
        model: 'vcs_UserEmail',
        record: {
          user: {uid: user.login, source: this.streamName.source},
          email: user.email,
        },
      });
    }
    const type = GitHubCommon.vcs_UserType(user);
    res.push({
      model: 'vcs_User',
      record: omitBy(
        {
          uid: user.login,
          source: this.streamName.source,
          name: user.name,
          email: user.email,
          htmlUrl: user.html_url,
          type,
        },
        (value) => isNil(value) || isEmpty(value)
      ),
    });
    return res;
  }

  protected convertMembership(user: User, org: string): DestinationRecord[] {
    const res: DestinationRecord[] = [];
    res.push({
      model: 'vcs_Membership',
      record: {
        user: {uid: user.login, source: this.streamName.source},
        organization: {uid: toLower(org), source: this.streamName.source},
      },
    });
    return res;
  }
}

export interface ProjectKey {
  uid: string;
  source: string;
}
