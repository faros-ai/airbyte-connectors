import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter} from '../converter';

interface OrgKey {
  uid: string;
  source: string;
}

interface RepositoryKey {
  name: string;
  organization: OrgKey;
}

/** Common functions shares across GitLab converters */
export class GitlabCommon {
  // Max length for free-form description text fields such as issue body
  static readonly MAX_DESCRIPTION_LENGTH = 1000;

  static parseRepositoryKey(
    webUrl: string | undefined,
    source: string,
    startIndex = 3
  ): undefined | RepositoryKey {
    if (!webUrl) return undefined;
    const repositoryIndex = startIndex + 1;

    const orgRepo: ReadonlyArray<string> = webUrl.split('/');
    if (orgRepo.length < repositoryIndex) return undefined;

    const organization = orgRepo[startIndex];
    const repositoryName = orgRepo[repositoryIndex];
    return {
      name: repositoryName?.toLowerCase(),
      organization: {uid: organization?.toLowerCase(), source},
    };
  }
}

/** GitLab converter base */
export abstract class GitlabConverter extends Converter {
  /** Almost every GitLab record have id property. Function will be
   * override if record doesn't have id property.
   */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }
}
