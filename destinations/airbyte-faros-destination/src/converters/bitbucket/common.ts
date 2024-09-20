import {AirbyteRecord} from 'faros-airbyte-cdk';
import {User} from 'faros-airbyte-common/bitbucket';
import {Utils} from 'faros-js-client';
import {toLower} from 'lodash';

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

export interface RepositoryRecord {
  uid: string;
  name: string;
  organization: {uid: string; source: string};
}

/** Common functions shares across Bitbucket converters */
export class BitbucketCommon {
  // max length for free-form description text field
  static MAX_DESCRIPTION_LENGTH = 1000;

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

  static vcs_Repository(
    workspace: string,
    repo: string,
    source: string
  ): RepositoryRecord {
    return {
      name: toLower(repo),
      uid: toLower(repo),
      organization: {uid: toLower(workspace), source},
    };
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
}
