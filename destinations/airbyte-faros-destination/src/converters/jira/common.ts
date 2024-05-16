import {AirbyteRecord} from 'faros-airbyte-cdk';
import {isString} from 'lodash';
import {Dictionary} from 'ts-essentials';

import {Converter, StreamContext} from '../converter';

export interface Assignee {
  readonly uid: string;
  readonly assignedAt: Date;
}

export enum RepoSource {
  BITBUCKET = 'Bitbucket',
  GITHUB = 'GitHub',
  GITLAB = 'GitLab',
  VCS = 'VCS',
  AZURE = 'AZURE-REPOS',
}

export interface Repo {
  readonly source: RepoSource;
  readonly org: string;
  readonly name: string;
}

export interface PullRequest {
  readonly repo: Repo;
  readonly number: number;
  repoUrl: string;
  title: string;
  state: PullRequestState;
  origin: string;
  mergedAt: string;
  author: {uid: string; source: string};
}

export interface PullRequestStream {
  id?: string;
  updated: string;
  branches?: any[];
  _instance?: PullRequestInstance;
  pullRequests?: PullRequestData[];
  repositories?: [];
}

export interface PullRequestInstance {
  id?: string;
  name?: string;
  type?: string;
  baseUrl?: string;
  typeName?: string;
  singleInstance?: boolean;
}

export interface PullRequestData {
  author?: PullRequestDataAuthor;
  id?: string;
  name?: string;
  commentCount?: number;
  source?: PullRequestDataBranchInfo;
  destination?: PullRequestDataBranchInfo;
  reviewers?: any[];
  status?: string;
  url?: string;
  lastUpdate?: string;
  repositoryId?: string;
  repositoryName?: string;
  repositoryUrl?: string;
}

export interface PullRequestDataAuthor {
  name: string;
  avatar: string;
}

export interface PullRequestDataBranchInfo {
  branch: string;
  url: string;
}
export interface PullRequestState {
  category: PullRequestStateCategory;
  detail: string;
}

export enum PullRequestStateCategory {
  Closed = 'Closed',
  Merged = 'Merged',
  Open = 'Open',
  Custom = 'Custom',
}

export interface Status {
  readonly category: string;
  readonly detail: string;
}

export interface StatusValue {
  oldValue: string;
  newValue: string;
}

export interface SprintIssue {
  id: number;
  key: string;
  fields: Dictionary<any>;
  issueId: string;
  sprintId: number;
}

export class JiraCommon {
  static POINTS_FIELD_NAMES = ['Story Points', 'Story point estimate'];
  static DEV_FIELD_NAME = 'Development';
  static EPIC_LINK_FIELD_NAME = 'Epic Link';
  static EPIC_TYPE_NAME = 'Epic';
  static SPRINT_FIELD_NAME = 'Sprint';
  static DEFAULT_ADDITIONAL_FIELDS_ARRAY_LIMIT = 50;
  static DEFAULT_TRUNCATE_LIMIT = 10_000;

  static normalize(str: string): string {
    return str.replace(/\s/g, '').toLowerCase();
  }
}

export const JiraStatusCategories: ReadonlyMap<string, string> = new Map(
  ['Todo', 'InProgress', 'Done'].map((s) => [JiraCommon.normalize(s), s])
);

export interface JiraConfig {
  additional_fields_array_limit?: number;
  exclude_fields?: string[];
  use_board_ownership?: boolean;
  truncate_limit?: number;
}

export abstract class JiraConverter extends Converter {
  source = 'Jira';

  /** All Jira records should have id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }

  protected jiraConfig(ctx: StreamContext): JiraConfig {
    return ctx.config.source_specific_configs?.jira ?? {};
  }

  protected additionalFieldsArrayLimit(ctx: StreamContext): number {
    return (
      this.jiraConfig(ctx).additional_fields_array_limit ??
      JiraCommon.DEFAULT_ADDITIONAL_FIELDS_ARRAY_LIMIT
    );
  }

  protected excludeFields(ctx: StreamContext): Set<string> {
    return new Set(this.jiraConfig(ctx).exclude_fields ?? []);
  }

  protected truncateLimit(ctx: StreamContext): number {
    return (
      this.jiraConfig(ctx).truncate_limit ?? JiraCommon.DEFAULT_TRUNCATE_LIMIT
    );
  }

  protected truncate(ctx: StreamContext, str?: string): string | undefined {
    if (isString(str) && str.length > this.truncateLimit(ctx)) {
      return str.substring(0, this.truncateLimit(ctx));
    }
    return str;
  }

  protected useBoardOwnership(ctx: StreamContext): boolean {
    return this.jiraConfig(ctx).use_board_ownership ?? false;
  }

  protected getOrganizationFromUrl(url?: string): string {
    if (url) {
      const parts = url.split('/');
      const username = parts[2].split('.')[0];
      return username;
    } else {
      return '';
    }
  }

  protected getRepoOrganizationFromUrl(url: string): string {
    return url.split('/')[3];
  }
}
