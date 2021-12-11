import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter, DestinationRecord, StreamContext} from '../converter';
import {User} from './types';

interface BitbucketConfig {
  application_mapping?: ApplicationMapping;
}

type ApplicationMapping = Record<string, {name: string; platform: string}>;

export interface CategoryRef {
  readonly category: string;
  readonly detail: string;
}

enum UserTypeCategory {
  BOT = 'Bot',
  ORGANIZATION = 'Organization',
  USER = 'User',
  CUSTOM = 'Custom',
}

/** Common functions shares across Bitbucket converters */
export class BitbucketCommon {
  // max length for free-form description text field
  static MAX_DESCRIPTION_LENGTH = 1000;

  static vcsUser(user: User, source: string): DestinationRecord | undefined {
    if (!user.accountId) return undefined;

    const userType =
      user.type === 'user'
        ? {category: UserTypeCategory.USER, detail: 'user'}
        : {category: UserTypeCategory.CUSTOM, detail: user.type};

    return {
      model: 'vcs_User',
      record: {
        uid: user.accountId,
        name: user.displayName,
        type: userType,
        htmlUrl: user.links?.htmlUrl,
        source,
      },
    };
  }
}

/** Bitbucket converter base */
export abstract class BitbucketConverter extends Converter {
  /** Almost all Bitbucket records should have id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }

  protected bitbucketConfig(ctx: StreamContext): BitbucketConfig {
    // TODO:
    return (ctx as any).config.source_specific_configs?.bitbucket;
  }

  protected applicationMapping(ctx: StreamContext): ApplicationMapping {
    return this.bitbucketConfig(ctx).application_mapping ?? {};
  }
}
