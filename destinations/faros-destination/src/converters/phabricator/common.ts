import {AirbyteRecord} from 'faros-airbyte-cdk';
import {toLower} from 'lodash';
import {Dictionary} from 'ts-essentials';

import {Converter} from '../converter';

/** Common functions shares across Phabricator converters */
export class PhabricatorCommon {
  // Max length for free-form description text fields such as issue body
  static readonly MAX_DESCRIPTION_LENGTH = 1000;

  static vcs_UserType(user: Dictionary<any>): {
    category: string;
    detail: string;
  } {
    if (toLower(user.type) === 'user') {
      const roles: ReadonlyArray<string> = Array.isArray(user?.fields?.roles)
        ? user?.fields?.roles
        : [];

      if (roles.includes('bot')) {
        return {category: 'Bot', detail: 'bot'};
      }
      if (roles.includes('list')) {
        return {category: 'Custom', detail: 'list'};
      }
      return {category: 'User', detail: 'user'};
    }
    return {category: 'Custom', detail: 'unknown'};
  }

  static getRepositoryURIs(
    repository: Dictionary<any>
  ): ReadonlyArray<Dictionary<any>> {
    const uris = repository?.attachments?.uris?.uris;
    if (!uris || !Array.isArray(uris)) return [];
    return uris;
  }

  static repositoryKey(
    repository: Dictionary<any>,
    source: string
  ): undefined | RepositoryKey {
    const repoName = repository?.fields?.shortName;
    if (!repoName) return undefined;

    return {
      name: toLower(repoName),
      organization: PhabricatorCommon.orgKey(source),
    };
  }

  static orgKey(source: string): undefined | OrgKey {
    return {uid: source, source};
  }
}

/** Phabricator converter base */
export abstract class PhabricatorConverter extends Converter {
  /** Most of Phabricator records should have phid property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.phid;
  }
}

export interface RepositoryKey {
  name: string;
  organization: OrgKey;
}

export interface OrgKey {
  uid: string;
  source: string;
}
