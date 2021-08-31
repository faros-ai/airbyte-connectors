import {toLower} from 'lodash';
import {Dictionary} from 'ts-essentials';

import {DestinationRecord} from '../converter';

/** Common functions shares across GitHub converters */
export class GithubCommon {
  static vcs_User_with_Membership(
    user: Dictionary<any>,
    source: string
  ): ReadonlyArray<DestinationRecord> {
    const vcsUser = GithubCommon.vcs_User(user, source);
    const repository = GithubCommon.parseRepositoryKey(user.repository, source);

    if (!repository) return [vcsUser];

    const vcsMembership = GithubCommon.vcs_Membership(
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

  static vcs_User(user: Dictionary<any>, source: string): DestinationRecord {
    const type = GithubCommon.vcs_UserType(user);
    return {
      model: 'vcs_User',
      record: {
        uid: user.login,
        name: user.name ?? null,
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

  static tms_User(user: Dictionary<any>, source: string): DestinationRecord {
    return {
      model: 'tms_User',
      record: {
        uid: user.login,
        name: user.name,
        source,
      },
    };
  }

  static parseRepositoryKey(
    repository: string,
    source: string
  ): undefined | RepositoryKey {
    if (!repository) return undefined;

    const orgRepo: ReadonlyArray<string> = repository.split('/');
    if (orgRepo.length != 2) return undefined;

    const [organization, repositoryName] = orgRepo;
    return {
      name: toLower(repositoryName),
      organization: {uid: toLower(organization), source},
    };
  }
}

export interface RepositoryKey {
  name: string;
  organization: {uid: string; source: string};
}
