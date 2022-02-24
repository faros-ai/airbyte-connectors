import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';
import {toLower} from 'lodash';
import {Dictionary} from 'ts-essentials';

import {Converter, DestinationRecord, StreamName} from '../converter';

/** Common functions shares across GitHub converters */
export class GithubCommon {
  // Max length for free-form description text fields such as issue body
  static readonly MAX_DESCRIPTION_LENGTH = 1000;

  static vcs_User_with_Membership(
    user: Dictionary<any>,
    source: string
  ): DestinationRecord[] {
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

  static tms_User(user: Dictionary<any>, source: string): DestinationRecord {
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
            GithubCommon.MAX_DESCRIPTION_LENGTH
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
  ): undefined | RepositoryKey {
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
}

/** Github converter base */
export abstract class GithubConverter extends Converter {
  /** All Github records should have id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }

  get streamName(): StreamName {
    if (this.stream) return this.stream;
    this.stream = new StreamName('GitHub', super.streamName.name);
    return this.stream;
  }
}

export interface RepositoryKey {
  name: string;
  uid: string;
  organization: OrgKey;
}

export interface OrgKey {
  uid: string;
  source: string;
}

export interface ProjectKey {
  uid: string;
  source: string;
}
