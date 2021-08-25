import {Dictionary} from 'ts-essentials';

import {DestinationRecord} from '../converter';

/** Common functions shares across GitHub converters */
export class GithubCommon {
  static vcs_User(user: Dictionary<any>, source: string): DestinationRecord {
    const type = ((): {category: string; detail: string} => {
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
    })();

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
}
