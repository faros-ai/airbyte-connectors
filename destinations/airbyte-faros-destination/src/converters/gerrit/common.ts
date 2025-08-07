import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {Converter, DestinationRecord, StreamContext} from '../converter';

export interface CategoryRef {
  readonly category: string;
  readonly detail: string;
}

interface OrgKey {
  uid: string;
  source: string;
}

interface RepositoryKey {
  name: string;
  uid: string;
  organization: OrgKey;
}

interface ProjectKey {
  uid: string;
  source: string;
}

interface UserKey {
  uid: string;
  source: string;
}

/** Common functions shared across Gerrit converters */
export class GerritCommon {
  // Max length for free-form description text fields
  static readonly MAX_DESCRIPTION_LENGTH = 1000;

  static vcs_User(account: any, source: string): DestinationRecord {
    const uid = account.username || account.email || `user_${account._account_id}`;
    return {
      model: 'vcs_User',
      record: {
        uid,
        name: account.name || account.display_name || uid,
        email: account.email,
        source,
      },
    };
  }

  static tms_User(account: any, source: string): DestinationRecord {
    const uid = account.username || account.email || `user_${account._account_id}`;
    return {
      model: 'tms_User',
      record: {
        uid,
        name: account.name || account.display_name || uid,
        emailAddress: account.email,
        source,
      },
    };
  }

  static mapChangeStatus(status: string): {category: string; detail: string} {
    switch (status?.toUpperCase()) {
      case 'NEW':
        return {category: 'Open', detail: 'New'};
      case 'MERGED':
        return {category: 'Merged', detail: 'Merged'};
      case 'ABANDONED':
        return {category: 'Closed', detail: 'Abandoned'};
      default:
        return {category: 'Custom', detail: status || 'Unknown'};
    }
  }

  static mapReviewState(label: string, value: number): {category: string; detail: string} {
    if (label === 'Code-Review') {
      if (value >= 2) {
        return {category: 'Approved', detail: `Code-Review +${value}`};
      } else if (value <= -2) {
        return {category: 'ChangesRequested', detail: `Code-Review ${value}`};
      } else if (value > 0) {
        return {category: 'Commented', detail: `Code-Review +${value}`};
      } else if (value < 0) {
        return {category: 'Commented', detail: `Code-Review ${value}`};
      }
    } else if (label === 'Verified') {
      if (value > 0) {
        return {category: 'Approved', detail: `Verified +${value}`};
      } else if (value < 0) {
        return {category: 'ChangesRequested', detail: `Verified ${value}`};
      }
    }
    
    return {category: 'Commented', detail: `${label} ${value}`};
  }

  static extractProjectOrg(projectName: string): {org: string; repo: string} {
    // Gerrit projects can have slashes, so we'll use the first part as org
    // and the rest as repo name
    const parts = projectName.split('/');
    if (parts.length === 1) {
      // No org structure, use 'gerrit' as default org
      return {org: 'gerrit', repo: projectName};
    }
    return {
      org: parts[0],
      repo: parts.slice(1).join('/'),
    };
  }

  static sanitizeUid(uid: string): string {
    // Replace special characters that might cause issues
    return uid.replace(/[^a-zA-Z0-9_\-./]/g, '_');
  }
}

export abstract class GerritConverter extends Converter {
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }

  protected gerritSource(): string {
    return 'Gerrit';
  }
}