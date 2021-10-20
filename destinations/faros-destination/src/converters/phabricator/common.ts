import {AirbyteRecord} from 'faros-airbyte-cdk';
import {toLower} from 'lodash';
import {Dictionary} from 'ts-essentials';

import {Converter} from '../converter';

/** Common functions shares across Phabricator converters */
export class PhabricatorCommon {
  // Max length for free-form description text fields such as issue body
  static readonly MAX_DESCRIPTION_LENGTH = 1000;

  static getRepositoryURIs(
    repository: Dictionary<any>
  ): ReadonlyArray<Dictionary<any>> {
    const uris = repository?.attachments?.uris?.uris;
    if (!uris || !Array.isArray(uris)) return [];
    return uris;
  }

  static parseRepositoryKey(
    repository: Dictionary<any>,
    source: string
  ): undefined | RepositoryKey {
    const repoName = repository?.fields?.shortName;
    if (!repoName) return undefined;

    const uris = PhabricatorCommon.getRepositoryURIs(repository);
    for (const uri of uris) {
      try {
        const url = new URL(uri?.fields?.uri?.effective);
        const organization = url.hostname;
        if (organization) {
          return {
            name: toLower(repoName),
            organization: {uid: toLower(organization), source},
          };
        }
      } catch (e) {
        continue;
      }
    }
    return undefined;
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
