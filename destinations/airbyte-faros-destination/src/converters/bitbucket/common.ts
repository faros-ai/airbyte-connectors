import {AirbyteRecord} from 'faros-airbyte-cdk';
import {User} from 'faros-airbyte-common/bitbucket';
import {Utils} from 'faros-js-client';
import {isEmpty, toLower} from 'lodash';

import {
  Converter,
  DestinationRecord,
  parseObjectConfig,
  StreamContext,
} from '../converter';

interface BitbucketConfig {
  application_mapping?: ApplicationMapping;
  max_description_length?: number;
}

type ApplicationMapping = Record<string, {name: string; platform: string}>;

export interface CategoryRef {
  readonly category: string;
  readonly detail?: string;
}

export enum UserTypeCategory {
  BOT = 'Bot',
  ORGANIZATION = 'Organization',
  USER = 'User',
  CUSTOM = 'Custom',
}

export type PartialUser = Partial<User>;

export interface ProjectKey {
  uid: string;
  source: string;
}
/** Common functions shares across Bitbucket converters */
export class BitbucketCommon {
  // max length for free-form description text field
  static MAX_DESCRIPTION_LENGTH = 1000;

  static vcsUser(
    user: PartialUser,
    source: string
  ): DestinationRecord | undefined {
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
        email: user.emailAddress,
        type: userType,
        htmlUrl: user.links?.htmlUrl,
        source,
      },
    };
  }

  static tms_ProjectBoard_with_TaskBoard(
    projectKey: ProjectKey,
    name: string,
    description: string | null,
    createdAt: string | null | undefined,
    updatedAt: string | null | undefined
  ): DestinationRecord[] {
    return [
      {
        model: 'tms_Project',
        record: {
          ...projectKey,
          name: name,
          description: Utils.cleanAndTruncate(
            description,
            BitbucketCommon.MAX_DESCRIPTION_LENGTH
          ),
          createdAt: Utils.toDate(createdAt),
          updatedAt: Utils.toDate(updatedAt),
        },
      },
      {
        model: 'tms_TaskBoard',
        record: {
          ...projectKey,
          name,
        },
      },
      {
        model: 'tms_TaskBoardProjectRelationship',
        record: {
          board: projectKey,
          project: projectKey,
        },
      },
    ];
  }
}

/** Bitbucket converter base */
export abstract class BitbucketConverter extends Converter {
  source = 'Bitbucket';

  protected collectedUsers = new Map<string, Array<PartialUser>>();

  /** Almost all Bitbucket records should have id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }

  protected bitbucketConfig(ctx: StreamContext): BitbucketConfig {
    return ctx.config?.source_specific_configs?.bitbucket;
  }

  protected applicationMapping(ctx: StreamContext): ApplicationMapping {
    return (
      parseObjectConfig(
        this.bitbucketConfig(ctx)?.application_mapping,
        'Application Mapping'
      ) ?? {}
    );
  }

  protected maxDescriptionLength(ctx: StreamContext): number {
    return (
      this.bitbucketConfig(ctx)?.max_description_length ??
      BitbucketCommon.MAX_DESCRIPTION_LENGTH
    );
  }

  protected collectUser(user: PartialUser, workspace: string): void {
    if (!user?.accountId) return;
    if (!this.collectedUsers.has(user.accountId)) {
      this.collectedUsers.set(user.accountId, []);
    }
    this.collectedUsers.get(user.accountId)?.push({
      ...user,
      workspace,
    });
  }

  protected convertUsers(): DestinationRecord[] {
    const records: DestinationRecord[] = [];
    const source = this.streamName.source;
    for (const [accountId, users] of this.collectedUsers.entries()) {
      const emails = new Set(
        users.map((user) => user.emailAddress).filter((email) => !!email)
      );
      for (const email of emails) {
        records.push({
          model: 'vcs_UserEmail',
          record: {
            user: {uid: accountId, source},
            email,
          },
        });
      }
      const workspaces = new Set(
        users.map((user) => user.workspace).filter((org) => !isEmpty(org))
      );
      for (const workspace of workspaces) {
        records.push({
          model: 'vcs_Membership',
          record: {
            user: {uid: accountId, source},
            organization: {uid: toLower(workspace), source},
          },
        });
      }
      const finalUser = this.getFinalUser(users);
      records.push(BitbucketCommon.vcsUser(finalUser, source));
    }
    return records;
  }

  // Replace non-null user attributes to our copy of the user
  // e.g. accountId, displayName, emailAddress, type, links.
  private getFinalUser(users: Array<PartialUser>) {
    const finalUser: PartialUser = {};
    for (const user of users) {
      for (const key in user) {
        if (!finalUser[key] && user[key]) {
          finalUser[key] = user[key];
        }
      }
    }
    return finalUser;
  }
}
