import {AirbyteRecord} from 'faros-airbyte-cdk';
import {User} from 'faros-airbyte-common/bitbucket';
import {Utils} from 'faros-js-client';

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

export interface ProjectKey {
  uid: string;
  source: string;
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
          description: description?.substring(
            0,
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

  protected collectedUsers = new Map<string, User>();

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
      parseObjectConfig(
        this.bitbucketConfig(ctx)?.max_description_length,
        'Max Description Length'
      ) ?? BitbucketCommon.MAX_DESCRIPTION_LENGTH
    );
  }

  protected collectUser(user: User) {
    if (!user?.accountId) return;
    this.collectedUsers.set(user.accountId, user);
  }

  protected convertUsers(): DestinationRecord[] {
    const records: DestinationRecord[] = [];
    records.push(
      ...Array.from(this.collectedUsers.values()).map((user) =>
        BitbucketCommon.vcsUser(user, this.source)
      )
    );
    // TODO: also write to vcs_Membership and vcs_UserEmail
    return records;
  }
}
