import {AirbyteLogger} from 'faros-airbyte-cdk';
import {calculateDateRange} from 'faros-airbyte-common/common';
import fetch, {RequestInit, Response} from 'node-fetch';
import {VError} from 'verror';

import {GerritAuthentication, GerritConfig} from './types';

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_TIMEOUT_MS = 120000;
const DEFAULT_CONCURRENCY_LIMIT = 4;
const DEFAULT_REJECT_UNAUTHORIZED = true;
const DEFAULT_CUTOFF_DAYS = 90;

export interface GerritChange {
  id: string;
  project: string;
  branch: string;
  change_id: string;
  subject: string;
  status: string;
  created: string;
  updated: string;
  submitted?: string;
  submitter?: GerritAccount;
  insertions: number;
  deletions: number;
  total_comment_count?: number;
  unresolved_comment_count?: number;
  has_review_started?: boolean;
  _number: number;
  owner: GerritAccount;
  topic?: string;
  hashtags?: string[];
  current_revision?: string;
  revisions?: Record<string, GerritRevision>;
  labels?: Record<string, GerritLabel>;
  requirements?: GerritRequirement[];
  submit_records?: GerritSubmitRecord[];
}

export interface GerritRevision {
  _number: number;
  created: string;
  uploader: GerritAccount;
  ref: string;
  commit?: GerritCommit;
  files?: Record<string, GerritFileInfo>;
  description?: string;
}

export interface GerritCommit {
  author: GerritGitPersonInfo;
  committer: GerritGitPersonInfo;
  subject: string;
  message: string;
  parents: Array<{commit: string}>;
}

export interface GerritGitPersonInfo {
  name: string;
  email: string;
  date: string;
  tz?: number;
}

export interface GerritFileInfo {
  status?: string;
  binary?: boolean;
  old_path?: string;
  lines_inserted?: number;
  lines_deleted?: number;
  size_delta?: number;
  size?: number;
}

export interface GerritLabel {
  approved?: GerritAccount;
  rejected?: GerritAccount;
  recommended?: GerritAccount;
  disliked?: GerritAccount;
  blocking?: boolean;
  value?: number;
  default_value?: number;
  values?: Record<string, string>;
  all?: GerritApproval[];
}

export interface GerritApproval {
  value?: number;
  date?: string;
  _account_id: number;
  name?: string;
  email?: string;
  username?: string;
}

export interface GerritRequirement {
  status: string;
  fallback_text: string;
  type: string;
}

export interface GerritSubmitRecord {
  status: string;
  labels?: Array<{
    label: string;
    status: string;
    appliedBy?: GerritAccount;
  }>;
}

export interface GerritAccount {
  _account_id: number;
  name?: string;
  email?: string;
  username?: string;
  display_name?: string;
  status?: string;
  registered_on?: string;
  inactive?: boolean;
  tags?: string[];
}

export interface GerritProject {
  id: string;
  name: string;
  parent?: string;
  description?: string;
  state?: string;
  branches?: Record<string, string>;
  labels?: Record<string, GerritLabelType>;
  web_links?: GerritWebLink[];
}

export interface GerritLabelType {
  values: Record<string, string>;
  default_value?: number;
  can_override?: boolean;
  copy_any_score?: boolean;
  copy_min_score?: boolean;
  copy_max_score?: boolean;
  copy_all_scores_if_no_change?: boolean;
  copy_all_scores_if_no_code_change?: boolean;
  copy_all_scores_on_trivial_rebase?: boolean;
  copy_all_scores_on_merge_first_parent_update?: boolean;
  copy_values?: string[];
  allow_post_submit?: boolean;
  ignore_self_approval?: boolean;
}

export interface GerritWebLink {
  name: string;
  url: string;
  image_url?: string;
}

export interface GerritBranch {
  ref: string;
  revision: string;
  can_delete?: boolean;
}

export interface GerritTag {
  ref: string;
  revision: string;
  object?: string;
  message?: string;
  tagger?: GerritGitPersonInfo;
  created?: string;
  can_delete?: boolean;
}

export interface GerritGroup {
  id: string;
  name: string;
  url?: string;
  options?: {
    visible_to_all?: boolean;
  };
  description?: string;
  group_id?: number;
  owner?: string;
  owner_id?: string;
  created_on?: string;
  members?: string[];
  includes?: string[];
}

export interface GerritComment {
  id: string;
  author?: GerritAccount;
  tag?: string;
  message?: string;
  updated: string;
  revision?: string;
  unresolved?: boolean;
  in_reply_to?: string;
  line?: number;
  range?: {
    start_line: number;
    start_character: number;
    end_line: number;
    end_character: number;
  };
  commit_id?: string;
  path?: string;
}

export interface GerritReview {
  labels?: Record<string, number>;
  message?: string;
  tag?: string;
  reviewer?: GerritAccount;
  date?: string;
}

export class GerritClient {
  private readonly baseUrl: string;
  private readonly auth: GerritAuthentication;
  private readonly pageSize: number;
  private readonly timeout: number;
  private readonly rejectUnauthorized: boolean;
  private readonly concurrencyLimit: number;
  private activeFetches = 0;
  private readonly fetchQueue: Array<() => void> = [];

  constructor(
    private readonly config: GerritConfig,
    private readonly logger: AirbyteLogger
  ) {
    this.baseUrl = config.server_url.replace(/\/$/, '');
    this.auth = config.authentication;
    this.pageSize = config.page_size ?? DEFAULT_PAGE_SIZE;
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT_MS;
    this.rejectUnauthorized = config.reject_unauthorized ?? DEFAULT_REJECT_UNAUTHORIZED;
    this.concurrencyLimit = config.concurrency_limit ?? DEFAULT_CONCURRENCY_LIMIT;

    const dateRange = calculateDateRange({
      start_date: config.start_date,
      end_date: config.end_date,
      cutoff_days: config.cutoff_days ?? DEFAULT_CUTOFF_DAYS,
      logger: (message: string) => logger.info(message),
    });
    this.config.startDate = dateRange.startDate;
    this.config.endDate = dateRange.endDate;
  }

  async checkConnection(): Promise<void> {
    try {
      await this.request('/config/server/version');
      this.logger.info('Successfully connected to Gerrit server');
    } catch (error) {
      throw new VError(error, 'Failed to connect to Gerrit server');
    }
  }

  private async request<T = any>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    await this.waitForCapacity();
    this.activeFetches++;

    try {
      const url = `${this.baseUrl}/a${path}`;
      const headers: Record<string, string> = {
        Accept: 'application/json',
        ...options.headers,
      };

      if (this.auth.type === 'basic' || this.auth.type === 'digest') {
        const credentials = Buffer.from(
          `${this.auth.username}:${this.auth.password}`
        ).toString('base64');
        headers.Authorization = `Basic ${credentials}`;
      }

      const response = await fetch(url, {
        ...options,
        headers,
        timeout: this.timeout,
        agent: this.rejectUnauthorized ? undefined : new (require('https').Agent)({
          rejectUnauthorized: false,
        }),
      });

      if (!response.ok) {
        throw new VError(
          `Gerrit API request failed: ${response.status} ${response.statusText}`
        );
      }

      const text = await response.text();
      if (text.startsWith(")]}'\n")) {
        return JSON.parse(text.substring(5));
      }
      return JSON.parse(text);
    } finally {
      this.activeFetches--;
      this.processQueue();
    }
  }

  private async waitForCapacity(): Promise<void> {
    if (this.activeFetches < this.concurrencyLimit) {
      return;
    }

    return new Promise<void>((resolve) => {
      this.fetchQueue.push(resolve);
    });
  }

  private processQueue(): void {
    if (this.fetchQueue.length > 0 && this.activeFetches < this.concurrencyLimit) {
      const next = this.fetchQueue.shift();
      if (next) {
        next();
      }
    }
  }

  async *listProjects(
    options: {skip?: string} = {}
  ): AsyncGenerator<GerritProject[]> {
    let skip = options.skip;
    let hasMore = true;

    while (hasMore) {
      const params = new URLSearchParams({
        n: this.pageSize.toString(),
        ...(skip && {S: skip}),
      });

      const response = await this.request<Record<string, GerritProject>>(
        `/projects/?${params}`
      );

      const projects = Object.entries(response).map(([id, project]) => ({
        ...project,
        id,
      }));

      if (projects.length > 0) {
        yield projects;
        const lastProject = projects[projects.length - 1];
        skip = lastProject.id;
      }

      hasMore = projects.length === this.pageSize;
    }
  }

  async *listChanges(
    query: string,
    options: {skip?: number; additionalFields?: string[]} = {}
  ): AsyncGenerator<GerritChange[]> {
    let skip = options.skip ?? 0;
    let hasMore = true;
    const fields = options.additionalFields ?? [];

    while (hasMore) {
      const params = new URLSearchParams({
        q: query,
        n: this.pageSize.toString(),
        S: skip.toString(),
        ...fields.reduce((acc, field) => ({...acc, o: field}), {}),
      });

      const response = await this.request<GerritChange[]>(
        `/changes/?${params}`
      );

      if (response.length > 0) {
        yield response;
        skip += response.length;
      }

      hasMore = response.length === this.pageSize;
    }
  }

  async getChange(
    changeId: string,
    options: {additionalFields?: string[]} = {}
  ): Promise<GerritChange> {
    const fields = options.additionalFields ?? [];
    const params = fields.length > 0 
      ? '?' + fields.map(f => `o=${f}`).join('&')
      : '';

    return this.request(`/changes/${changeId}${params}`);
  }

  async *listComments(changeId: string): AsyncGenerator<GerritComment[]> {
    const response = await this.request<Record<string, GerritComment[]>>(
      `/changes/${changeId}/comments`
    );

    for (const [path, comments] of Object.entries(response)) {
      const commentsWithPath = comments.map(comment => ({
        ...comment,
        path,
      }));
      yield commentsWithPath;
    }
  }

  async *listReviews(changeId: string): AsyncGenerator<GerritReview[]> {
    const response = await this.request<any[]>(
      `/changes/${changeId}/reviewers`
    );

    const reviews: GerritReview[] = [];
    for (const reviewer of response) {
      if (reviewer.approvals) {
        for (const [label, value] of Object.entries(reviewer.approvals)) {
          reviews.push({
            labels: {[label]: value as number},
            reviewer: reviewer,
            date: reviewer.date,
          });
        }
      }
    }

    if (reviews.length > 0) {
      yield reviews;
    }
  }

  async *listAccounts(
    query: string,
    options: {skip?: number} = {}
  ): AsyncGenerator<GerritAccount[]> {
    let skip = options.skip ?? 0;
    let hasMore = true;

    while (hasMore) {
      const params = new URLSearchParams({
        q: query,
        n: this.pageSize.toString(),
        S: skip.toString(),
      });

      const response = await this.request<GerritAccount[]>(
        `/accounts/?${params}`
      );

      if (response.length > 0) {
        yield response;
        skip += response.length;
      }

      hasMore = response.length === this.pageSize;
    }
  }

  async *listBranches(
    projectId: string,
    options: {skip?: string} = {}
  ): AsyncGenerator<GerritBranch[]> {
    let skip = options.skip;
    let hasMore = true;

    while (hasMore) {
      const params = new URLSearchParams({
        n: this.pageSize.toString(),
        ...(skip && {S: skip}),
      });

      const response = await this.request<GerritBranch[]>(
        `/projects/${encodeURIComponent(projectId)}/branches?${params}`
      );

      if (response.length > 0) {
        yield response;
        const lastBranch = response[response.length - 1];
        skip = lastBranch.ref;
      }

      hasMore = response.length === this.pageSize;
    }
  }

  async *listTags(
    projectId: string,
    options: {skip?: string} = {}
  ): AsyncGenerator<GerritTag[]> {
    let skip = options.skip;
    let hasMore = true;

    while (hasMore) {
      const params = new URLSearchParams({
        n: this.pageSize.toString(),
        ...(skip && {S: skip}),
      });

      const response = await this.request<GerritTag[]>(
        `/projects/${encodeURIComponent(projectId)}/tags?${params}`
      );

      if (response.length > 0) {
        yield response;
        const lastTag = response[response.length - 1];
        skip = lastTag.ref;
      }

      hasMore = response.length === this.pageSize;
    }
  }

  async *listGroups(
    options: {skip?: string} = {}
  ): AsyncGenerator<GerritGroup[]> {
    let skip = options.skip;
    let hasMore = true;

    while (hasMore) {
      const params = new URLSearchParams({
        n: this.pageSize.toString(),
        ...(skip && {S: skip}),
      });

      const response = await this.request<Record<string, GerritGroup>>(
        `/groups/?${params}`
      );

      const groups = Object.entries(response).map(([id, group]) => ({
        ...group,
        id,
      }));

      if (groups.length > 0) {
        yield groups;
        const lastGroup = groups[groups.length - 1];
        skip = lastGroup.id;
      }

      hasMore = groups.length === this.pageSize;
    }
  }

  async getCommit(
    projectId: string,
    commitId: string
  ): Promise<GerritCommit> {
    return this.request(
      `/projects/${encodeURIComponent(projectId)}/commits/${commitId}`
    );
  }
}