import {AirbyteRecord} from 'faros-airbyte-cdk';
import {
  NewUser,
  selfHRef,
  User,
} from 'faros-airbyte-common/lib/bitbucket-server/types';

import {UserTypeCategory} from '../bitbucket/common';
import {Converter, DestinationRecord} from '../converter';

export const SOURCE = 'Bitbucket-Server';

export class BitbucketServerCommon {
  static vcsUserNew(
    user: NewUser,
    source: string
  ): DestinationRecord | undefined {
    if (!user.slug) return undefined;
    return {
      model: 'vcs_User',
      record: {
        uid: user.slug,
        name: user.displayName,
        email: user.emailAddress,
        type: {category: UserTypeCategory.USER, detail: 'user'},
        htmlUrl: selfHRef(user.links),
        source,
      },
    };
  }

  static vcsUser(user: User, source: string): DestinationRecord | undefined {
    if (!user.accountId) return undefined;

    return {
      model: 'vcs_User',
      record: {
        uid: user.accountId,
        name: user.displayName,
        email: user.emailAddress,
        type: {category: UserTypeCategory.USER, detail: 'user'},
        htmlUrl: user.links?.htmlUrl,
        source,
      },
    };
  }
}

export abstract class BitbucketServerConverter extends Converter {
  source = SOURCE;

  /** Almost all Bitbucket records should have id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }
}
