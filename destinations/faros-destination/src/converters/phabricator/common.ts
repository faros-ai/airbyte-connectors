import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';
import {toLower} from 'lodash';
import {Dictionary} from 'ts-essentials';

import {Converter} from '../converter';

/** Common functions shares across Phabricator converters */
export class PhabricatorCommon {
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

  static vcs_PullRequestState(revisionStatus: Dictionary<any>): {
    category: string;
    detail: string;
  } {
    const detail = toLower(revisionStatus?.value);
    if (!detail) return {category: 'Custom', detail: 'unknown'};

    switch (detail) {
      case 'abandoned':
        return {category: 'Closed', detail};
      case 'published':
        return {category: 'Merged', detail};
      case 'needs-review':
      case 'needs-revision':
      case 'changes-planned':
      case 'accepted':
      case 'draft':
        return {category: 'Open', detail};
      default:
        return {category: 'Custom', detail};
    }
  }

  static vcs_PullRequestReviewState(reviewStatus: string): {
    category: string;
    detail: string;
  } {
    const detail = toLower(reviewStatus);
    if (!detail) return {category: 'Custom', detail: 'unknown'};

    switch (detail) {
      case 'rejected':
        return {category: 'ChangesRequested', detail};
      case 'accepted':
        return {category: 'Approved', detail};
      default:
        return {category: 'Custom', detail};
    }
  }

  static parseCommitMessage(message: string): CommitMessage | undefined {
    if (!message) return undefined;

    const parts = message.split('\n\n');
    const revision = parts.find((p) => p.startsWith('Differential Revision:'));
    const revisionIdStr = revision
      ? revision.split('/D').reverse()[0].trim()
      : undefined;
    const revisionId = Utils.parseIntegerWithDefault(revisionIdStr, -1);

    return {
      message: parts.length > 0 ? parts[0] : undefined,
      revisionId: revisionId >= 0 ? revisionId : undefined,
    };
  }

  static repositoryURIs(
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
    // Since Phabricator does not have a concept of organization,
    // we are simply using the source name instead
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

export interface CommitMessage {
  message?: string;
  revisionId?: number;
}

export interface RepositoryKey {
  name: string;
  organization: OrgKey;
}

export interface OrgKey {
  uid: string;
  source: string;
}
