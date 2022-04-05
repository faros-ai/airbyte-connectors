import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {
  Converter,
  DestinationRecord,
  parseObjectConfig,
  StreamContext,
} from '../converter';
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
}
