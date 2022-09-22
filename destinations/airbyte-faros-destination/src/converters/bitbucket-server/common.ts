import {AirbyteRecord} from 'faros-airbyte-cdk';
import {selfHRef, User} from 'faros-airbyte-common/lib/bitbucket-server/types';

import {UserTypeCategory} from '../bitbucket/common';
import {Converter, DestinationRecord} from '../converter';

type VcsOrgRef = {uid: string; source: string};
type VcsRepoRef = {uid: string; name: string; organization: VcsOrgRef};

export abstract class BitbucketServerConverter extends Converter {
  source = 'Bitbucket-Server';

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

  protected vcsRepoRef(projectKey: string, repoSlug: string): VcsRepoRef {
    return {
      uid: repoSlug.toLowerCase(),
      name: repoSlug.toLowerCase(),
      organization: this.vcsOrgRef(projectKey),
    };
  }

  protected vcsOrgRef(projectKey: string): VcsOrgRef {
    return {uid: projectKey.toLowerCase(), source: this.streamName.source};
  }
}
