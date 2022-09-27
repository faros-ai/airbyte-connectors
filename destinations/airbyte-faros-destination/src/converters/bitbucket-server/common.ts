import {AirbyteRecord} from 'faros-airbyte-cdk';
import {selfHRef, User} from 'faros-airbyte-common/bitbucket-server';

import {UserTypeCategory} from '../bitbucket/common';
import {OrgKey, RepoKey} from '../common/vcs';
import {Converter, DestinationRecord} from '../converter';

export abstract class BitbucketServerConverter extends Converter {
  source = 'Bitbucket';

  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }

  protected vcsUser(
    user?: User
  ):
    | {record: DestinationRecord; ref: {uid: string; source: string}}
    | undefined {
    if (!user?.slug) return undefined;
    const source = this.streamName.source;
    return {
      record: {
        model: 'vcs_User',
        record: {
          uid: user.slug,
          name: user.displayName,
          email: user.emailAddress,
          type: {category: UserTypeCategory.USER, detail: 'user'},
          htmlUrl: selfHRef(user.links),
          source,
        },
      },
      ref: {uid: user.slug, source},
    };
  }

  protected vcsRepoKey(projectKey: string, repoSlug: string): RepoKey {
    return {
      uid: repoSlug.toLowerCase(),
      name: repoSlug.toLowerCase(),
      organization: this.vcsOrgKey(projectKey),
    };
  }

  protected vcsOrgKey(projectKey: string): OrgKey {
    return {uid: projectKey.toLowerCase(), source: this.streamName.source};
  }
}
