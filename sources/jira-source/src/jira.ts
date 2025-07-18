import axios, {AxiosInstance} from 'axios';
import {AxiosCacheInstance, setupCache} from 'axios-cache-interceptor';
import {AirbyteConfig, AirbyteLogger} from 'faros-airbyte-cdk';
import {
  bucket,
  normalizeString,
  RoundRobinConfig,
  validateBucketingConfig,
} from 'faros-airbyte-common/common';
import {
  FarosProject,
  Issue,
  IssueCompact,
  IssueField,
  PullRequest,
  Repo,
  RepoSource,
  SprintIssue,
  SprintReport,
  Status,
  Team,
  TeamMembership,
  User,
} from 'faros-airbyte-common/jira';
import {FarosClient, Utils, wrapApiError} from 'faros-js-client';
import * as fs from 'fs';
import parseGitUrl from 'git-url-parse';
import https from 'https';
import jira, {AgileModels, Version2Models} from 'jira.js';
import {
  chunk,
  concat,
  isEmpty,
  isNil,
  pick,
  toInteger,
  toLower,
  toString,
} from 'lodash';
import pLimit from 'p-limit';
import path from 'path';
import {Memoize} from 'typescript-memoize';
import {VError} from 'verror';

import {JiraClient} from './client';
import {IssueTransformer} from './issue_transformer';
import {RunMode} from './streams/common';

export interface JiraConfig extends AirbyteConfig, RoundRobinConfig {
  readonly url: string;
  readonly username?: string;
  readonly password?: string;
  readonly token?: string;
  readonly additional_fields?: ReadonlyArray<string>;
  readonly additional_fields_array_limit?: number;
  readonly reject_unauthorized?: boolean;
  readonly concurrency_limit?: number;
  readonly max_retries?: number;
  readonly retry_delay?: number;
  readonly page_size?: number;
  readonly timeout?: number;
  readonly use_users_prefix_search?: boolean;
  readonly users_prefix_search_max_depth?: number;
  readonly users_prefix_search_api_hard_limit?: number;
  readonly use_faros_graph_boards_selection?: boolean;
  readonly projects?: ReadonlyArray<string>;
  readonly excluded_projects?: ReadonlyArray<string>;
  readonly boards?: ReadonlyArray<string>;
  readonly excluded_boards?: ReadonlyArray<string>;
  readonly cutoff_days?: number;
  readonly cutoff_lag_days?: number;
  readonly run_mode?: RunMode;
  readonly custom_streams?: ReadonlyArray<string>;
  readonly api_url?: string;
  readonly api_key?: string;
  readonly graph?: string;
  readonly requestedStreams?: Set<string>;
  readonly use_sprints_reverse_search?: boolean;
  readonly use_faros_board_issue_tracker?: boolean;
  readonly use_projects_as_boards?: boolean;
  readonly fetch_teams?: boolean;
  readonly organization_id?: string;
  readonly start_date?: string;
  readonly end_date?: string;
  readonly source_qualifier?: string;
  readonly custom_headers?: string;
  readonly fetch_issue_comments?: boolean;
  // startDate and endDate are calculated from start_date, end_date, and cutoff_days
  startDate?: Date;
  endDate?: Date;
}

export const toFloat = (value: any): number | undefined =>
  isNil(value) ? undefined : Utils.parseFloatFixedPoint(value);

// Check for field name differences between classic and next-gen projects
// for fields to promote to top-level fields.
// https://community.atlassian.com/t5/Jira-Software-questions/Story-point-and-story-point-estimate-duplicate-fields/qaq-p/904742
export const DEV_FIELD_NAME = 'Development';
const POINTS_FIELD_NAMES: ReadonlyArray<string> = [
  'Story Points',
  'Story point estimate',
];

// Epic Link and Sprint are custom fields
const EPIC_LINK_FIELD_NAME = 'Epic Link';
// https://community.developer.atlassian.com/t/jira-api-v3-include-sprint-in-get-issue-search/35411
const SPRINT_FIELD_NAME = 'Sprint';

const BROWSE_PROJECTS_PERM = 'BROWSE_PROJECTS';

// PR info attached to issues can vary by Jira instance. Known patterns:
// 1. pullrequest={dataType=pullrequest, state=MERGED, stateCount=1}
// 2. PullRequestOverallDetails{openCount=1, mergedCount=1, declinedCount=0}
const prRegex = new RegExp(
  '(?<prDetails>PullRequestOverallDetails{openCount=(?<open>[0-9]+), ' +
    'mergedCount=(?<merged>[0-9]+), declinedCount=(?<declined>[0-9]+)})|' +
    '(?<pr>pullrequest={dataType=pullrequest, state=(?<state>[a-zA-Z]+), ' +
    'stateCount=(?<count>[0-9]+)})'
);

export const JIRA_CLOUD_REGEX = /^https:\/\/(.*)\.atlassian\.net/g;
const PREFIX_CHARS = [...'abcdefghijklmnopqrstuvwxyz', ...'0123456789'];

const MAX_SPRINT_HISTORY_FETCH_FAILURES = 5;

const SPRINT_BOARD_QUERY = fs.readFileSync(
  path.join(__dirname, '..', 'resources', 'queries', 'tms-sprint-board.gql'),
  'utf8'
);

const PROJECT_QUERY = fs.readFileSync(
  path.join(__dirname, '..', 'resources', 'queries', 'tms-project.gql'),
  'utf8'
);

const PROJECT_BOARDS_QUERY = fs.readFileSync(
  path.join(__dirname, '..', 'resources', 'queries', 'tms-project-boards.gql'),
  'utf8'
);

const TEAMS_QUERY = fs.readFileSync(
  path.join(__dirname, '..', 'resources', 'queries', 'get-teams.gql'),
  'utf8'
);

const DEFAULT_ADDITIONAL_FIELDS_ARRAY_LIMIT = 50;
const DEFAULT_REJECT_UNAUTHORIZED = true;
const DEFAULT_CONCURRENCY_LIMIT = 5;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY = 5_000;
const DEFAULT_PAGE_SIZE = 250;
const DEFAULT_TIMEOUT = 120_000; // 2 minutes
const DEFAULT_USE_USERS_PREFIX_SEARCH = false;
const DEFAULT_USERS_PREFIX_SEARCH_MAX_DEPTH = 2;
const DEFAULT_USERS_PREFIX_SEARCH_API_HARD_LIMIT = 1000;
export const DEFAULT_CUTOFF_DAYS = 90;
export const DEFAULT_CUTOFF_LAG_DAYS = 0;
const DEFAULT_BUCKET_ID = 1;
const DEFAULT_BUCKET_TOTAL = 1;
export const DEFAULT_API_URL = 'https://prod.api.faros.ai';
export const DEFAULT_GRAPH = 'default';
const DEFAULT_USE_SPRINTS_REVERSE_SEARCH = false;
const DEFAULT_FETCH_ISSUE_COMMENTS = false;
// https://community.developer.atlassian.com/t/is-it-possible-to-pull-a-list-of-sprints-in-a-project-via-the-rest-api/53336/3
const MAX_SPRINTS_RESULTS = 50;
//https://developer.atlassian.com/platform/teams/rest/v1/api-group-teams-members-public-api/#api-gateway-api-public-teams-v1-org-orgid-teams-teamid-members-post
const MAX_TEAMS_RESULTS = 50;
// Documented in the migration notes of enhanced JQL (https://developer.atlassian.com/changelog/#CHANGE-2046)
const MAX_CHANGELOG_RESULTS = 40;
const MAX_COMMENTS_RESULTS = 20;

export class Jira {
  private static jira: Jira;
  private readonly fieldIdsByName: Map<string, string[]>;
  private readonly seenIssues: Map<string, IssueCompact[]> = new Map<
    string,
    IssueCompact[]
  >();
  private readonly sprintReportFailuresByBoard = new Map<string, number>();

  constructor(
    // Pass base url to enable creating issue url that can navigated in browser
    // https://community.atlassian.com/t5/Jira-questions/How-can-I-get-an-issue-url-that-can-be-navigated-to-in-the/qaq-p/1500948
    private readonly baseURL: string,
    private readonly api: JiraClient,
    private readonly http: AxiosInstance | AxiosCacheInstance,
    private readonly fieldNameById: Map<string, string>,
    private readonly additionalFieldsArrayLimit: number,
    private readonly statusByName: Map<string, Status>,
    private readonly statusById: Map<string, Status>,
    private readonly isCloud: boolean,
    private readonly concurrencyLimit: number,
    private readonly maxPageSize: number,
    private readonly bucketId: number,
    private readonly bucketTotal: number,
    private readonly logger: AirbyteLogger,
    private readonly useUsersPrefixSearch?: boolean,
    private readonly usersPrefixSearchMaxDepth?: number,
    private readonly usersPrefixSearchApiHardLimit?: number,
    private readonly requestedStreams?: Set<string>,
    private readonly useSprintsReverseSearch?: boolean,
    private readonly organizationId?: string,
    private readonly sourceQualifier?: string,
    private readonly fetchIssueComments?: boolean
  ) {
    // Create inverse mapping from field name -> ids
    // Field can have multiple ids with the same name
    this.fieldIdsByName = new Map<string, string[]>();
    for (const [id, name] of fieldNameById) {
      if (!this.fieldIdsByName.has(name)) {
        this.fieldIdsByName.set(name, []);
      }
      this.fieldIdsByName.get(name)?.push(id);
    }
  }

  static async instance(cfg: JiraConfig, logger: AirbyteLogger): Promise<Jira> {
    if (Jira.jira) return Jira.jira;

    if (isEmpty(cfg.url)) {
      throw new VError('Please provide a Jira URL');
    }

    const isCloud = cfg.url.match(JIRA_CLOUD_REGEX) != null;
    const jiraType = isCloud ? 'Cloud' : 'Server/DC';
    logger?.debug(`Assuming ${cfg.url} to be a Jira ${jiraType} instance`);

    const authentication = Jira.auth(cfg);

    validateBucketingConfig(cfg, logger.info.bind(logger));

    const httpsAgent = new https.Agent({
      rejectUnauthorized:
        cfg.reject_unauthorized ?? DEFAULT_REJECT_UNAUTHORIZED,
    });

    const http = setupCache(axios.create(), {ttl: 60 * 60 * 1000}); // 60 minutes cache
    const api = new JiraClient({
      // Telemetry will not be collected (for jira.js >= 2.x)
      ...{telemetry: false},
      host: cfg.url,
      authentication,
      baseRequestConfig: {
        httpsAgent,
        headers: {
          'Accept-Language': 'en',
          'X-Force-Accept-Language': true,
          ...JSON.parse(cfg.custom_headers ?? '{}'),
        },
        timeout: cfg.timeout ?? DEFAULT_TIMEOUT,
        // https://github.com/axios/axios/issues/5058#issuecomment-1272229926
        paramsSerializer: {indexes: null},
      },
      isCloud,
      maxRetries: cfg.max_retries ?? DEFAULT_MAX_RETRIES,
      retryDelay: cfg.retry_delay ?? DEFAULT_RETRY_DELAY,
      logger: logger,
    });

    const addAllFields = cfg.additional_fields?.includes('*');
    const additionalFields = new Set(cfg.additional_fields ?? []);
    // We always add the following custom fields since they
    // are promoted to standard fields
    additionalFields.add(DEV_FIELD_NAME);
    additionalFields.add(EPIC_LINK_FIELD_NAME);
    additionalFields.add(SPRINT_FIELD_NAME);
    POINTS_FIELD_NAMES.forEach((f) => additionalFields.add(f));

    const fieldNameById = new Map<string, string>();
    let totalNumFields = 0;
    for (const field of await api.v2.issueFields.getFields()) {
      totalNumFields++;
      if (field.id && field.name) {
        if (addAllFields || additionalFields.has(field.name)) {
          fieldNameById.set(field.id, field.name);
        }
      }
    }
    const fieldMapping = Array.from(fieldNameById)
      .map((e) => `${e[0]} -> ${e[1]}`)
      .join(', ');
    logger?.debug(
      `Total number of fields: ${totalNumFields}. Projected field mapping: ${fieldMapping}`
    );

    const statusByName = new Map<string, Status>();
    const statusById = new Map<string, Status>();
    for (const status of await api.v2.workflowStatuses.getStatuses()) {
      if (status.name && status.statusCategory?.name) {
        statusByName.set(normalizeString(status.name), {
          category: status.statusCategory.name,
          detail: status.name,
        });
      }
      if (status.id && status.statusCategory?.name) {
        statusById.set(status.id, {
          category: status.statusCategory.name,
          detail: status.name,
        });
      }
    }

    if (cfg.fetch_teams && isCloud && !cfg.organization_id) {
      throw new VError(
        'Organization ID must be provided for fetching teams in Jira Cloud'
      );
    }

    Jira.jira = new Jira(
      cfg.url,
      api,
      http,
      fieldNameById,
      cfg.additional_fields_array_limit ??
        DEFAULT_ADDITIONAL_FIELDS_ARRAY_LIMIT,
      statusByName,
      statusById,
      isCloud,
      cfg.concurrency_limit ?? DEFAULT_CONCURRENCY_LIMIT,
      cfg.page_size ?? DEFAULT_PAGE_SIZE,
      cfg.bucket_id ?? DEFAULT_BUCKET_ID,
      cfg.bucket_total ?? DEFAULT_BUCKET_TOTAL,
      logger,
      cfg.use_users_prefix_search ?? DEFAULT_USE_USERS_PREFIX_SEARCH,
      cfg.users_prefix_search_max_depth ??
        DEFAULT_USERS_PREFIX_SEARCH_MAX_DEPTH,
      cfg.users_prefix_search_api_hard_limit ??
        DEFAULT_USERS_PREFIX_SEARCH_API_HARD_LIMIT,
      cfg.requestedStreams,
      cfg.use_sprints_reverse_search ?? DEFAULT_USE_SPRINTS_REVERSE_SEARCH,
      cfg.organization_id,
      cfg.source_qualifier,
      cfg.fetch_issue_comments ?? DEFAULT_FETCH_ISSUE_COMMENTS
    );
    return Jira.jira;
  }

  /** Return an auth config object for the Jira API client */
  private static auth(cfg: JiraConfig): jira.Config.Authentication {
    if (cfg.token) {
      return {personalAccessToken: cfg.token};
    } else if (cfg.username && cfg.password) {
      return {basic: {username: cfg.username, password: cfg.password}};
    } else {
      throw new VError(
        'Either Jira personal token or Jira username and password must be provided'
      );
    }
  }

  private async *iterate<V>(
    requester: (startAt: number) => Promise<any>,
    deserializer: (item: any) => Promise<V> | V | undefined,
    itemsField = 'values'
  ): AsyncIterableIterator<V> {
    let startAt = 0;
    let count = 0;
    do {
      const res = await requester(startAt);
      const items = Array.isArray(res) ? res : res[itemsField];
      const promises = [];
      const limit = pLimit(this.concurrencyLimit);
      for (const item of items) {
        promises.push(limit(() => deserializer(item)));
      }
      const deserializedItems = await Promise.all(promises);
      for (const deserializedItem of deserializedItems) {
        if (deserializedItem) {
          yield deserializedItem;
        }
        count++;
      }
      // Pagination is inconsistent across the API, so we need to check various
      // conditions. Preference is given to the 'isLast' property.
      const isLast = res.isLast ?? (count === res.total || items.length === 0);
      startAt = isLast ? -1 : startAt + items.length;
    } while (startAt >= 0);
  }

  private async *tokenPaginate<V>(
    requester: (nextPageToken: string | undefined) => Promise<any>,
    deserializer: (item: any) => Promise<V> | V | undefined,
    itemsField: string
  ): AsyncIterableIterator<V> {
    let nextPageToken = undefined;
    do {
      const response = await requester(nextPageToken);
      const items = response[itemsField];
      const promises = [];
      const limit = pLimit(this.concurrencyLimit);
      for (const item of items) {
        promises.push(limit(() => deserializer(item)));
      }
      const deserializedItems = await Promise.all(promises);
      for (const deserializedItem of deserializedItems) {
        if (deserializedItem) {
          yield deserializedItem;
        }
      }
      nextPageToken = response.nextPageToken;
    } while (nextPageToken);
  }

  private async getPullRequestSources(
    issueId: string
  ): Promise<ReadonlyArray<string>> {
    const res = await this.api.getDevStatusSummary(issueId);
    // Instance types are the PR sources, e.g., GitHub, Bitbucket, etc.
    const sources: any = {};
    const branchByInstanceType = res.summary?.branch?.byInstanceType;
    const pullsByInstanceType = res.summary?.pullrequest?.byInstanceType;
    const reposByInstanceType = res.summary?.repository?.byInstanceType;
    const keys = concat(
      branchByInstanceType ? Object.keys(branchByInstanceType) : [],
      pullsByInstanceType ? Object.keys(pullsByInstanceType) : [],
      reposByInstanceType ? Object.keys(reposByInstanceType) : []
    );
    for (const key of keys) {
      // TODO: Add other sources. They need more work and verification.
      if (
        Jira.equalsIgnoreCase(key, RepoSource.GITHUB) ||
        Jira.equalsIgnoreCase(key, RepoSource.BITBUCKET) ||
        Jira.equalsIgnoreCase(key, RepoSource.GIT_FOR_JIRA_CLOUD)
      ) {
        sources[key] = 1;
      }
    }
    return Object.keys(sources);
  }

  private static equalsIgnoreCase(s1: string, s2: string): boolean {
    return s1.localeCompare(s2, undefined, {sensitivity: 'accent'}) === 0;
  }

  private static extractRepo(repoUrl: string): Repo {
    const gitUrl = parseGitUrl(repoUrl);
    const lowerSource = gitUrl.source?.toLowerCase();
    let source: RepoSource;
    if (lowerSource?.includes('bitbucket')) source = RepoSource.BITBUCKET;
    else if (lowerSource?.includes('gitlab')) source = RepoSource.GITLAB;
    else if (lowerSource?.includes('github')) source = RepoSource.GITHUB;
    else source = RepoSource.VCS;
    return {
      source,
      org: gitUrl.organization,
      name: gitUrl.name,
    };
  }

  private static hasPullRequests(devField: any): boolean {
    if (devField && devField !== '{}') {
      // example of dev field that matches PR details to use as devField parameter for testing -> "PullRequestOverallDetails{openCount=1, mergedCount=1, declinedCount=0}"
      const m = prRegex.exec(devField);
      if (m?.groups) {
        const groups = m.groups;
        if (groups.prDetails) {
          const open = Utils.parseInteger(groups.open);
          const merged = Utils.parseInteger(groups.merged);
          const declined = Utils.parseInteger(groups.declined);
          return open + merged + declined > 0;
        } else if (groups.pr) {
          const count = Utils.parseInteger(groups.count);
          return count > 0;
        }
      }
    }
    return false;
  }

  async getPullRequests(issueId: string): Promise<ReadonlyArray<PullRequest>> {
    // In order to get PR details we have to query by repo source
    const sources = await this.getPullRequestSources(issueId);
    for (const source of sources) {
      const branchRes = await this.api.getDevStatusDetail(
        issueId,
        source,
        'branch'
      );
      if (Jira.equalsIgnoreCase(source, RepoSource.GITHUB)) {
        return await this.getPullRequestsGitHub(branchRes);
      } else if (Jira.equalsIgnoreCase(source, RepoSource.BITBUCKET)) {
        const repoRes = this.api.getDevStatusDetail(
          issueId,
          source,
          'repository'
        );
        return await this.getPullRequestsBitbucket(branchRes, repoRes);
      } else if (Jira.equalsIgnoreCase(source, RepoSource.GIT_FOR_JIRA_CLOUD)) {
        return await this.getPullRequestsGitForJiraCloud(issueId, branchRes);
      }
    }
    return [];
  }

  async getPullRequestsGitHub(
    branchRes: any
  ): Promise<ReadonlyArray<PullRequest>> {
    const pulls = [];
    for (const detail of branchRes.detail ?? []) {
      for (const pull of detail.pullRequests ?? []) {
        const repoUrl = pull.source?.url;
        if (!repoUrl) {
          continue;
        }
        pulls.push({
          repo: Jira.extractRepo(repoUrl),
          number: Utils.parseInteger(pull.id.replace('#', '')),
        });
      }
    }

    return pulls;
  }

  async getPullRequestsBitbucket(
    branchRes: any,
    repoRes: any
  ): Promise<ReadonlyArray<PullRequest>> {
    const repos = [];
    for (const detail of repoRes.detail ?? []) {
      for (const repo of detail.repositories ?? []) {
        let workspace = undefined;
        try {
          // Get Bitbucket workspace name from 302 redirect location
          const loc = await this.http
            .get(repo.url, {maxRedirects: 0, validateStatus: null})
            .then((res) => res.headers.location);
          workspace = loc.split('/').filter((v) => v)[0];
          // eslint-disable-next-line no-empty
        } catch (error) {}
        repos.push({...repo, workspace});
      }
    }

    const pulls = [];
    for (const detail of branchRes.detail ?? []) {
      for (const pull of detail.pullRequests ?? []) {
        const repo = repos.find(
          (r) => `${r.url}/pull-requests/${pull.id}` === pull.url
        );
        if (repo && repo.name && repo.workspace) {
          pulls.push({
            repo: {
              source: RepoSource.BITBUCKET,
              org: repo.workspace,
              name: repo.name,
            },
            number: Utils.parseInteger(pull.id),
          });
        }
      }
    }

    return pulls;
  }

  async getPullRequestsGitForJiraCloud(
    issueId: string,
    branchRes: any
  ): Promise<ReadonlyArray<PullRequest>> {
    const pulls = [];
    for (const detail of branchRes.detail ?? []) {
      for (const pull of detail.pullRequests ?? []) {
        const repoUrl = pull.source?.url;
        if (!repoUrl) {
          continue;
        }
        const lowerSource = parseGitUrl(repoUrl).source?.toLowerCase();
        if (lowerSource?.includes('github')) {
          const githubPulls = await this.getPullRequestsGitHub(branchRes);
          pulls.push(...githubPulls);
        } else {
          this.logger?.warn(
            `Unsupported GitForJiraCloud VCS source: ${lowerSource} for issueId: ${issueId}`
          );
        }
      }
    }

    return pulls;
  }

  @Memoize((keys?: Set<string>) => JSON.stringify(Array.from(keys ?? [])))
  async getProjects(
    keys?: Set<string>
  ): Promise<ReadonlyArray<Version2Models.Project>> {
    const projects: Version2Models.Project[] = [];
    for await (const project of this.getProjectsIterator(keys)) {
      projects.push(project);
    }
    this.logger?.debug(
      `Found ${projects.length} browseable projects from Jira instance: ${projects.map((p) => p.key).join(', ')}`
    );
    return projects;
  }

  async *getProjectsIterator(
    keys?: Set<string>
  ): AsyncIterableIterator<Version2Models.Project> {
    if (this.isCloud) {
      if (!keys?.size) {
        yield* this.getProjectsFromCloud();
        return;
      }
      // Fetch 50 project keys at a time, the max allowed by the API
      for (const batch of chunk(Array.from(keys), 50)) {
        yield* this.getProjectsFromCloud(batch);
      }
      return;
    }

    yield* this.getProjectsFromServer(keys);
  }

  private async *getProjectsFromCloud(
    keys?: ReadonlyArray<string>
  ): AsyncIterableIterator<Version2Models.Project> {
    const projects = this.iterate(
      (startAt) =>
        this.api.v2.projects.searchProjects({
          expand: 'description',
          action: 'browse',
          startAt,
          maxResults: this.maxPageSize,
          ...(keys?.length && {keys: [...keys]}),
        }),
      (item: any) => ({
        id: item.id.toString(),
        key: item.key,
        name: item.name,
        description: item.description,
      })
    );
    for await (const project of projects) {
      // Bucket projects based on bucketId
      if (this.isProjectInBucket(project.key)) yield project;
    }
  }

  // Jira Server doesn't support searchProjects API, use getAllProjects
  // which returns all projects which are visible for the user
  // i.e. where the user has any of one of Browse Projects,
  // Administer Projects, Administer Jira permissions. To view issues the
  // user should have `BROWSE_PROJECTS` permissions on the project, so check
  // that permission is granted for the user using mypermissions endpoint.
  private async *getProjectsFromServer(
    keys: Set<string>
  ): AsyncIterableIterator<Version2Models.Project> {
    const skippedProjects: string[] = [];
    for await (const project of await this.api.getAllProjects()) {
      // Skip projects that are not in the project_keys list or bucket
      if (
        (keys?.size && !keys.has(project.key)) ||
        !this.isProjectInBucket(project.key)
      ) {
        continue;
      }

      try {
        const hasPermission = await this.hasProjectPermission(
          project.key,
          BROWSE_PROJECTS_PERM
        );
        if (!hasPermission) {
          skippedProjects.push(project.key);
          continue;
        }
        yield {
          id: project.id,
          key: project.key,
          name: project.name,
          description: project.description,
        };
      } catch (error: any) {
        if (error.response?.status === 404) {
          skippedProjects.push(project.key);
          continue;
        }
        const cause = wrapApiError(error);
        throw new VError(
          cause,
          'unable to verify permissions for project: %s',
          project.key
        );
      }
    }
    if (skippedProjects.length) {
      this.logger?.warn(
        `Skipped projects due to missing 'Browse Projects' permission: ${skippedProjects}`
      );
    }
  }

  async *getProjectsFromGraph(
    farosClient: FarosClient,
    graph: string
  ): AsyncIterableIterator<Version2Models.Project> {
    const source = this.sourceQualifier
      ? `Jira_${this.sourceQualifier}`
      : 'Jira';
    const projects = this.iterate(
      async (startAt) => {
        const data = await farosClient.gql(graph, PROJECT_QUERY, {
          source,
          offset: startAt,
          pageSize: this.maxPageSize,
        });
        return data?.tms_Project;
      },
      async (item: any) => {
        return {
          key: item.uid,
        };
      }
    );
    for await (const project of projects) {
      if (this.isProjectInBucket(project.key)) yield project;
    }
  }

  async getProject(id: string): Promise<Version2Models.Project> {
    const project = await this.api.v2.projects.getProject({
      projectIdOrKey: id,
      expand: 'description',
    });

    const hasPermission = await this.hasProjectPermission(
      project.key,
      BROWSE_PROJECTS_PERM
    );
    if (!hasPermission) {
      throw new VError('Insufficient permissions for project: %s', project.key);
    }

    return project;
  }

  @Memoize()
  async hasProjectPermission(
    projectKey: string,
    permission: string
  ): Promise<boolean> {
    const perms = await this.api.v2.permissions.getMyPermissions({
      permissions: permission,
      projectKey,
    });

    return perms?.permissions?.[permission]?.['havePermission'];
  }

  getIssuesKeys(jql: string): AsyncIterableIterator<string> {
    if (this.isCloud) {
      return this.getIssuesKeysFromCloud(jql);
    }
    return this.getIssuesKeysFromServer(jql);
  }

  getIssuesKeysFromServer(jql: string): AsyncIterableIterator<string> {
    return this.iterate(
      (startAt) =>
        this.api.v2.issueSearch.searchForIssuesUsingJql({
          jql,
          startAt,
          fields: ['key'],
          maxResults: this.maxPageSize,
        }),
      async (item: any) => item.key,
      'issues'
    );
  }

  // Use new Search for issues using JQL enhanced search API
  // https://developer.atlassian.com/cloud/jira/platform/rest/v2/api-group-issue-search/#api-rest-api-2-search-jql-post
  getIssuesKeysFromCloud(jql: string): AsyncIterableIterator<string> {
    return this.tokenPaginate(
      (nextPageToken) =>
        this.api.v2.issueSearch.searchForIssuesUsingJqlEnhancedSearchPost({
          jql,
          nextPageToken,
          fields: ['key'],
          maxResults: 5000, // For keys and ids we can fetch upto 5000 at a time
        }),
      (item: any) => item.key,
      'issues'
    );
  }

  getIssues(jql: string): AsyncIterableIterator<Issue> {
    const {fieldIds, additionalFieldIds} = this.getIssueFields();
    const issueTransformer = new IssueTransformer(
      this.baseURL,
      this.fieldNameById,
      this.fieldIdsByName,
      this.statusByName,
      additionalFieldIds,
      this.additionalFieldsArrayLimit,
      this.logger
    );

    const getParams = {
      jql,
      fields: [...fieldIds, ...additionalFieldIds],
    };

    if (this.isCloud) {
      return this.getIssuesFromCloud(getParams, issueTransformer);
    }

    return this.iterate(
      (startAt) =>
        this.api.v2.issueSearch.searchForIssuesUsingJql({
          ...getParams,
          startAt,
          expand: ['changelog'],
          maxResults: this.maxPageSize,
        }),
      async (item: any) => {
        this.memoizeIssue(item, jql);
        // Nested array type fields are expected to return at least 100 results
        return issueTransformer.toIssue(item);
      },
      'issues'
    );
  }

  // https://developer.atlassian.com/cloud/jira/platform/rest/v2/api-group-issue-search/#api-rest-api-2-search-jql-post
  getIssuesFromCloud(
    params: {jql: string; fields: string[]},
    issueTransformer: IssueTransformer
  ): AsyncIterableIterator<Issue> {
    return this.tokenPaginate(
      (nextPageToken) =>
        this.api.v2.issueSearch.searchForIssuesUsingJqlEnhancedSearchPost({
          ...params,
          expand: 'changelog',
          maxResults: this.maxPageSize,
          nextPageToken,
        }),
      async (item: any) => {
        let changelogHistories = item.changelog?.histories ?? [];
        // Enhanced JQL API returns max 40 changelogs so make extra call to
        // fetch them all
        if (item.changelog?.total > MAX_CHANGELOG_RESULTS) {
          const allChangelogs = [];
          for await (const changelog of this.iterate(
            (startAt) =>
              this.api.v2.issues.getChangeLogs({
                issueIdOrKey: item.id,
                startAt,
                maxResults: this.maxPageSize,
              }),
            async (item: any) => item
          )) {
            allChangelogs.push(changelog);
          }
          changelogHistories = allChangelogs;
        }

        let comments = item.fields?.comment?.comments;
        // Enhanced JQL API returns max 20 comments so make extra call to
        // fetch them all if comments are requested
        if (item.fields?.comment?.total > MAX_COMMENTS_RESULTS) {
          const allComments = [];
          for await (const comment of this.iterate(
            (startAt) =>
              this.api.v2.issueComments.getComments({
                issueIdOrKey: item.id,
                startAt,
                maxResults: this.maxPageSize,
              }),
            async (item: any) => item,
            'comments'
          )) {
            allComments.push(comment);
          }
          comments = allComments;
        }

        const updatedIssue = {
          ...item,
          changelog: {histories: changelogHistories},
          fields: {
            ...item.fields,
            ...(item.fields.comment && {
              comment: {
                comments,
              },
            }),
          },
        };
        this.memoizeIssue(updatedIssue, params.jql);
        // Other nested array type fields are expected to return at least 100 results
        return issueTransformer.toIssue(updatedIssue);
      },
      'issues'
    );
  }

  private memoizeIssue(item: any, jql: string) {
    const issue: IssueCompact = {
      id: item.id,
      key: item.key,
      created: Utils.toDate(item.fields.created),
      updated: Utils.toDate(item.fields.updated),
      fields: item.fields,
    };

    if (!this.seenIssues.has(jql)) {
      this.seenIssues.set(jql, []);
    }
    this.seenIssues.get(jql).push(issue);
  }

  async *getIssuesCompact(jql: string): AsyncIterableIterator<IssueCompact> {
    const {fieldIds, additionalFieldIds} = this.getIssueFields();
    if (this.seenIssues.has(jql)) {
      this.logger?.debug(`Using cached issues for JQL: ${jql}`);
      for (const issue of this.seenIssues.get(jql)) {
        yield issue;
      }
      return;
    }

    const fields = [...fieldIds, ...additionalFieldIds];

    if (this.isCloud) {
      yield* this.getIssuesCompactFromCloud(jql, fields);
      return;
    }

    yield* this.iterate(
      (startAt) =>
        this.api.v2.issueSearch.searchForIssuesUsingJql({
          jql,
          startAt,
          fields,
          maxResults: this.maxPageSize,
        }),
      async (item: any) => ({
        id: item.id,
        key: item.key,
        created: Utils.toDate(item.fields.created),
        updated: Utils.toDate(item.fields.updated),
        fields: item.fields,
      }),
      'issues'
    );
  }

  getIssuesCompactFromCloud(
    jql: string,
    fields: string[]
  ): AsyncIterableIterator<IssueCompact> {
    return this.tokenPaginate(
      (nextPageToken) =>
        this.api.v2.issueSearch.searchForIssuesUsingJqlEnhancedSearchPost({
          jql,
          fields,
          nextPageToken,
          maxResults: this.maxPageSize,
        }),
      (item: any) => ({
        id: item.id,
        key: item.key,
        created: Utils.toDate(item.fields.created),
        updated: Utils.toDate(item.fields.updated),
        fields: item.fields,
      }),
      'issues'
    );
  }

  async *getIssueCompactWithAdditionalFields(
    jql: string
  ): AsyncIterableIterator<IssueCompact> {
    const issues = this.getIssuesCompact(jql);
    const {additionalFieldIds} = this.getIssueFields();
    const issueTransformer = new IssueTransformer(
      this.baseURL,
      this.fieldNameById,
      this.fieldIdsByName,
      this.statusByName,
      additionalFieldIds,
      this.additionalFieldsArrayLimit
    );
    for await (const issue of issues) {
      yield {
        key: issue.key,
        updated: issue.updated,
        additionalFields: issueTransformer.extractAdditionalFields(issue),
      };
    }
  }

  async getIssuePullRequests(
    issue: IssueCompact
  ): Promise<ReadonlyArray<PullRequest>> {
    let pullRequests: ReadonlyArray<PullRequest> = [];
    const devFieldIds = this.fieldIdsByName.get(DEV_FIELD_NAME) ?? [];
    for (const devFieldId of devFieldIds) {
      if (
        pullRequests.length === 0 &&
        Jira.hasPullRequests(issue.fields[devFieldId])
      ) {
        try {
          pullRequests = await this.getPullRequests(issue.id);
          this.logger?.debug(
            `Fetched ${pullRequests.length} pull requests for issue ${issue.key}`
          );
        } catch (err: any) {
          this.logger?.warn(
            `Failed to get pull requests for issue ${issue.key}: ${err.message}`
          );
        }
      }
    }
    return pullRequests;
  }

  private getIssueFields(): {fieldIds: string[]; additionalFieldIds: string[]} {
    const fieldIds = new Set<string>(['id', 'key', 'created', 'updated']);

    if (this.requestedStreams?.has('faros_issue_pull_requests')) {
      fieldIds.add(DEV_FIELD_NAME);
    }

    if (this.requestedFarosIssuesStream()) {
      [
        'assignee',
        'created',
        'creator',
        'description',
        'issuelinks',
        'issuetype',
        'labels',
        'parent',
        'priority',
        'project',
        'resolution',
        'resolutiondate',
        'status',
        'subtasks',
        'summary',
        'updated',
      ].forEach((field) => fieldIds.add(field));

      if (this.fetchIssueComments) {
        fieldIds.add('comment');
      }
    }
    const additionalFieldIds: string[] = [];
    for (const fieldId of this.fieldNameById.keys()) {
      // Skip fields that are already included in the fields above
      if (!fieldIds.has(fieldId)) {
        additionalFieldIds.push(fieldId);
      }
    }
    return {fieldIds: Array.from(fieldIds), additionalFieldIds};
  }

  private requestedFarosIssuesStream() {
    return this.requestedStreams?.has('faros_issues');
  }

  // Project boards are one of the following:
  // - located in the project (location.projectKey === projectKey)
  // - relevant to the project (returned when using projectKeyOrId for get all board)
  @Memoize()
  async getProjectBoards(
    projectKey: string
  ): Promise<ReadonlyArray<AgileModels.Board>> {
    const boardMap = new Map<number, AgileModels.Board>();

    // Get all boards located in the project
    const allBoards = await this.getRelevantBoards();
    allBoards.forEach((board) => {
      if (board.location?.projectKey === projectKey) {
        boardMap.set(board.id, board);
      }
    });

    // Get boards relevant to the project
    const projectBoards = await this.getRelevantBoards(projectKey);
    for (const board of projectBoards) {
      boardMap.set(board.id, board);
    }

    return Array.from(boardMap.values());
  }

  // Get all if projectKey is not provided, otherwise, get boards relevant to the project.
  // See comment for projectKeyOrId query param for get all boards API call below.
  // https://developer.atlassian.com/cloud/jira/software/rest/api-group-board/#api-rest-agile-1-0-board-get
  @Memoize()
  private async getRelevantBoards(
    projectKey?: string
  ): Promise<ReadonlyArray<AgileModels.Board>> {
    const boards: AgileModels.Board[] = [];
    for await (const board of this.getBoardsIterator(projectKey)) {
      boards.push(board);
    }
    return boards;
  }

  private getBoardsIterator(
    projectKey?: string
  ): AsyncIterableIterator<AgileModels.Board> {
    return this.iterate(
      (startAt) =>
        this.api.agile.board.getAllBoards({
          startAt,
          maxResults: this.maxPageSize,
          ...(projectKey && {projectKeyOrId: projectKey}),
        }),
      (item: AgileModels.Board) => item
    );
  }

  // Fetch project with boards nested from Faros
  async *getProjectBoardsFromGraph(
    farosClient: FarosClient,
    graph: string,
    projectKeys: Array<string>
  ): AsyncIterableIterator<FarosProject> {
    const projects = this.iterate(
      async (startAt) => {
        const data = await farosClient.gql(graph, PROJECT_BOARDS_QUERY, {
          source: 'Jira',
          offset: startAt,
          pageSize: this.maxPageSize,
          projects: projectKeys,
        });
        return data?.tms_Project;
      },
      (item: any): FarosProject => {
        return {
          key: item.uid,
          boardUids: item.boards?.map((board: any) => board.board.uid) ?? [],
        };
      }
    );
    for await (const project of projects) {
      if (this.isProjectInBucket(project.key)) {
        yield project;
      }
    }
  }

  getBoard(id: string): Promise<AgileModels.Board> {
    const boardId = Utils.parseInteger(id);
    return this.api.agile.board.getBoard({boardId});
  }

  @Memoize()
  async getSprints(
    boardId: string,
    range?: [Date, Date]
  ): Promise<ReadonlyArray<AgileModels.Sprint>> {
    const sprintsIter = this.useSprintsReverseSearch
      ? this.getReverseSprintsIterator(boardId, range)
      : this.getSprintsIterator(boardId, range);
    const sprints: AgileModels.Sprint[] = [];
    for await (const sprint of sprintsIter) {
      sprints.push(sprint);
    }
    this.logger?.debug(`Fetched ${sprints.length} sprints in board ${boardId}`);
    return sprints;
  }

  private getSprintsIterator(
    boardId: string,
    range?: [Date, Date]
  ): AsyncIterableIterator<AgileModels.Sprint> {
    return this.iterate(
      (startAt) =>
        this.api.agile.board.getAllSprints({
          boardId: Utils.parseInteger(boardId),
          startAt,
          maxResults: this.maxPageSize,
        }),
      async (item: AgileModels.Sprint) => {
        const completeDate = Utils.toDate(item.completeDate);
        // Ignore sprints completed before the input date range cutoff date
        if (range && completeDate && completeDate < range[0]) {
          return;
        }
        return item;
      }
    );
  }

  private async *getReverseSprintsIterator(
    boardId: string,
    range?: [Date, Date]
  ): AsyncIterableIterator<AgileModels.Sprint> {
    const parsedBoardId = Utils.parseInteger(boardId);

    // First fetch open and future sprints normally
    yield* this.iterate(
      (startAt) =>
        this.api.agile.board.getAllSprints({
          boardId: parsedBoardId,
          startAt,
          state: 'active,future',
          maxResults: this.maxPageSize,
        }),
      async (item: any) => item
    );

    this.logger?.debug(
      `Fetching closed sprints starting with most recent in the backlog ` +
        `in board ${boardId}`
    );

    // Initial request to get the total number of closed sprints
    const initialResult = await this.api.agile.board.getAllSprints({
      boardId: parsedBoardId,
      state: 'closed',
      maxResults: MAX_SPRINTS_RESULTS,
    });

    const totalClosedSprints = initialResult.total;
    this.logger?.debug(
      `Initial total closed sprints in board ${boardId}: ${totalClosedSprints}`
    );

    if (!totalClosedSprints || totalClosedSprints < 1) {
      return;
    }

    let closedSprintsFound = 0;
    let pagesWithNoResults = 0;
    let count = 0;
    let startAt = totalClosedSprints - MAX_SPRINTS_RESULTS;
    let maxResults = MAX_SPRINTS_RESULTS;

    // Ensure startAt is not negative
    startAt = Math.max(startAt, 0);
    let isLast = false;

    do {
      let foundSprints = false;
      this.logger?.debug(
        `Fetching sprints in board ${boardId}: startAt ${startAt}, maxResults ` +
          `${maxResults}, pagesWithNoResults ${pagesWithNoResults}`
      );

      const res = await this.api.agile.board.getAllSprints({
        boardId: parsedBoardId,
        startAt,
        state: 'closed',
        maxResults,
      });

      const closedSprints = res.values;
      for (const sprint of closedSprints) {
        count++;
        const completeDate = Utils.toDate(sprint.completeDate);
        // Ignore sprints completed before the input date range cutoff date
        if (range && completeDate && completeDate < range[0]) {
          continue;
        }

        yield sprint;
        closedSprintsFound++;
        foundSprints = true;
      }
      pagesWithNoResults = foundSprints ? 0 : pagesWithNoResults + 1;

      if (pagesWithNoResults > 4) {
        this.logger?.debug(
          `No closed sprints found in ${pagesWithNoResults} pages in board ` +
            `${boardId}, stopping fetching additional sprints.`
        );
        break;
      }

      maxResults = Math.min(startAt, MAX_SPRINTS_RESULTS);
      startAt = Math.max(startAt - closedSprints.length, 0);
      isLast = count === totalClosedSprints || closedSprints.length === 0;
    } while (!isLast);

    this.logger?.debug(
      `Found ${closedSprintsFound} closed sprints in board ${boardId}.`
    );
  }

  async getSprintsFromFarosGraph(
    board: string,
    farosClient: FarosClient,
    graph: string,
    closedAtAfter?: Date
  ): Promise<ReadonlyArray<AgileModels.Sprint>> {
    const sprints: AgileModels.Sprint[] = [];
    for await (const sprint of this.getSprintsIteratorFromFarosGraph(
      board,
      farosClient,
      graph,
      closedAtAfter
    )) {
      sprints.push(sprint);
    }
    return sprints;
  }

  private getSprintsIteratorFromFarosGraph(
    board: string,
    farosClient: FarosClient,
    graph: string,
    closedAtAfter?: Date
  ): AsyncIterableIterator<AgileModels.Sprint> {
    return this.iterate(
      async (startAt) => {
        const data = await farosClient.gql(graph, SPRINT_BOARD_QUERY, {
          board,
          source: 'Jira',
          offset: startAt,
          pageSize: this.maxPageSize,
          closedAtAfter,
        });
        return data?.tms_SprintBoardRelationship;
      },
      async (item: any): Promise<AgileModels.Sprint> => {
        return {
          id: toInteger(item.sprint.uid),
          name: item.sprint.name,
          state: item.sprint.state,
          completeDate: item.sprint.closedAt,
          originBoardId: toInteger(board),
        };
      }
    );
  }

  async getSprintReport(
    sprint: AgileModels.Sprint,
    boardId: string
  ): Promise<SprintReport> {
    // Counts the number of failed calls to fetch sprint history
    // let sprintHistoryFetchFailures = 0;
    const boardFetchFailures =
      this.sprintReportFailuresByBoard.get(boardId) || 0;
    let report;

    try {
      if (
        boardFetchFailures < MAX_SPRINT_HISTORY_FETCH_FAILURES &&
        toLower(sprint.state) != 'future'
      ) {
        report = await this.api.getSprintReport(boardId, sprint.id);
        if (this.sprintReportFailuresByBoard.get(boardId)) {
          this.sprintReportFailuresByBoard.delete(boardId);
        }
      }
    } catch (err: any) {
      this.logger?.warn(
        `Failed to get sprint report for sprint ${sprint.id}: ${err.message}`
      );
      if (!this.sprintReportFailuresByBoard.has(boardId)) {
        this.sprintReportFailuresByBoard.set(boardId, 0);
      }
      this.sprintReportFailuresByBoard.set(boardId, boardFetchFailures + 1);
      if (
        this.sprintReportFailuresByBoard.get(boardId) >=
        MAX_SPRINT_HISTORY_FETCH_FAILURES
      ) {
        this.logger?.warn(
          `Disabling fetching sprint history, since it has failed ` +
            `${boardFetchFailures + 1} times in a row`
        );
      }
    }
    return this.toSprintReportFields(report?.contents, sprint, boardId);
  }

  private toSprintReportFields(
    report: any,
    sprint: AgileModels.Sprint,
    boardId: string
  ): SprintReport {
    if (!report) {
      return;
    }
    return {
      sprintId: sprint.id,
      boardId,
      completeDate: Utils.toDate(sprint.completeDate),
      issues: this.toSprintReportIssues(report),
    };
  }

  toSprintReportIssues(report: any): SprintIssue[] {
    const toSprintIssues = (issues: any, classification: string): any[] =>
      issues?.map((issue: any) => {
        // Jira Server returns statusId in issue.statusId, while Jira Cloud returns it in issue.status.id
        const statusId = issue.status?.id ?? issue.statusId;
        const status = statusId ? this.statusById.get(statusId) : undefined;
        return {
          key: issue.key,
          classification,
          status,
          points: toFloat(
            issue.currentEstimateStatistic?.statFieldValue?.value
          ),
          plannedPoints: toFloat(
            issue.estimateStatistic?.statFieldValue?.value
          ),
          addedDuringSprint: report?.issueKeysAddedDuringSprint?.[issue.key],
        };
      }) || [];

    const issues: SprintIssue[] = [];
    issues.push(...toSprintIssues(report?.completedIssues, 'Completed'));
    issues.push(
      ...toSprintIssues(
        report?.issuesCompletedInAnotherSprint,
        'CompletedOutsideSprint'
      )
    );
    issues.push(
      ...toSprintIssues(
        report?.issuesNotCompletedInCurrentSprint,
        'NotCompleted'
      )
    );
    issues.push(...toSprintIssues(report?.puntedIssues, 'Removed'));
    return issues;
  }

  @Memoize()
  async getBoardConfiguration(
    boardId: string
  ): Promise<AgileModels.GetConfiguration> {
    return this.api.agile.board.getConfiguration({
      boardId: Utils.parseInteger(boardId),
    });
  }

  async getBoardJQL(filterId: string): Promise<string> {
    const filterJQL = await this.api.v2.filters.getFilter({
      id: Utils.parseInteger(filterId),
      expand: 'jql',
    });
    return filterJQL.jql;
  }

  isProjectInBucket(projectKey: string): boolean {
    return (
      bucket('farosai/airbyte-jira-source', projectKey, this.bucketTotal) ===
      this.bucketId
    );
  }

  async *getFields(): AsyncGenerator<IssueField> {
    for (const [id, name] of this.fieldNameById) {
      yield {id, name};
    }
  }

  @Memoize()
  async getProjectVersions(
    projectKey: string,
    from: Date
  ): Promise<ReadonlyArray<Version2Models.Version>> {
    const versionsIterator = this.iterate(
      (startAt) =>
        this.api.v2.projectVersions.getProjectVersionsPaginated({
          startAt,
          projectIdOrKey: projectKey,
          orderBy: '-releaseDate',
          maxResults: this.maxPageSize,
        }),
      (item: Version2Models.Version) => item
    );

    const versions = [];
    for await (const version of versionsIterator) {
      if (version.releaseDate && new Date(version.releaseDate) < from) {
        break;
      }
      versions.push(version);
    }
    return versions;
  }

  getUsers(): AsyncIterableIterator<Version2Models.User> {
    if (this.isCloud) {
      return this.iterate(
        (startAt) =>
          this.api.v2.users.getAllUsersDefault({
            startAt,
            maxResults: this.maxPageSize,
          }),
        (item: Version2Models.User) => this.toUser(item)
      );
    }

    if (!this.useUsersPrefixSearch) {
      return this.findUsers('.');
    }

    return this.getUsersByPrefix();
  }

  private findUsers(
    username: string
  ): AsyncIterableIterator<Version2Models.User> {
    this.logger?.debug(`Searching for users with username '${username}'`);
    return this.iterate(
      (startAt) =>
        // use custom method searchUsers for Jira Server
        this.api.searchUsers(username, startAt, this.maxPageSize),
      (item: Version2Models.User) => this.toUser(item)
    );
  }

  private async *getUsersByPrefix(): AsyncIterableIterator<Version2Models.User> {
    // Keep track of seen users in order to avoid returning duplicates
    const seenUsers = new Set<string>();

    // Initialize stack with single-character prefixes (in reverse order so 'a' is processed first)
    const prefixStack: string[] = [];
    for (let i = PREFIX_CHARS.length - 1; i >= 0; i--) {
      prefixStack.push(PREFIX_CHARS[i]);
    }

    this.logger?.debug(
      `Starting user prefix search with ${prefixStack.length} initial prefixes, max depth: ${this.usersPrefixSearchMaxDepth}`
    );

    // Process stack until empty
    while (prefixStack.length > 0) {
      const prefix = prefixStack.pop()!;

      let userCount = 0;
      const res = this.findUsers(prefix);
      for await (const u of res) {
        userCount++;
        const uid = this.userId(u);
        if (!seenUsers.has(uid)) {
          seenUsers.add(uid);
          yield u;
        }
      }

      this.logger?.debug(
        `Prefix '${prefix}' (length ${prefix.length}): found ${userCount} users`
      );

      // If we hit the API hard limit and haven't reached max depth, expand the search
      if (
        userCount === this.usersPrefixSearchApiHardLimit &&
        prefix.length < this.usersPrefixSearchMaxDepth
      ) {
        this.logger?.debug(
          `Prefix '${prefix}' hit ${this.usersPrefixSearchApiHardLimit}-user limit, expanding to length ${prefix.length + 1}`
        );

        // Add extended prefixes to stack (in reverse order for proper DFS ordering)
        for (let i = PREFIX_CHARS.length - 1; i >= 0; i--) {
          const extendedPrefix = prefix + PREFIX_CHARS[i];
          prefixStack.push(extendedPrefix);
        }
      }
    }

    this.logger?.debug(
      `User prefix search completed. Total unique users found: ${seenUsers.size}`
    );
  }

  private userId(u: Version2Models.User): string {
    let id = '';
    for (const k of Object.keys(u).sort((a, b) => a.localeCompare(b))) {
      id += `[${k}:${u[k]}]`;
    }
    return id;
  }

  private toUser(user: Version2Models.User): Version2Models.User | undefined {
    if (!user.accountType || user.accountType === 'atlassian') {
      return pick(user, [
        'key',
        'accountId',
        'displayName',
        'emailAddress',
        'active',
      ]);
    }
    return undefined;
  }

  @Memoize()
  async getTeams(): Promise<ReadonlyArray<Team>> {
    const teams: Team[] = [];
    for await (const team of this.getTeamsIterator()) {
      teams.push(team);
    }
    return teams;
  }

  async *getTeamsIterator(): AsyncIterableIterator<Team> {
    if (this.isCloud) {
      yield* this.getTeamsFromCloud();
      return;
    }
    yield* this.getTeamsFromServer();
  }

  async *getTeamsFromCloud(): AsyncIterableIterator<Team> {
    let cursor: string | undefined = undefined;
    let hasNext = true;
    do {
      const response = await this.api.graphql(TEAMS_QUERY, {
        organizationId: `ari:cloud:platform::org/${this.organizationId}`,
        siteId: 'None',
        first: MAX_TEAMS_RESULTS,
        after: cursor,
      });
      const result = response.data?.team?.teamSearch;
      if (isNil(result)) {
        break;
      }
      cursor = result.pageInfo?.endCursor;
      hasNext = result.pageInfo?.hasNextPage;
      for (const {team} of result.nodes) {
        // Remove prefix from id
        const id = team.id.split('/').pop();
        yield {
          id,
          displayName: team.displayName,
        };
      }
    } while (hasNext);
  }

  async *getTeamsFromServer(): AsyncIterableIterator<Team> {
    yield* this.iterate(
      (startAt) => this.api.getTeams(startAt + 1, MAX_TEAMS_RESULTS),
      (item: any) => ({
        id: toString(item.id),
        displayName: item.title,
      })
    );
  }

  async *getTeamMemberships(): AsyncIterableIterator<TeamMembership> {
    if (this.isCloud) {
      for (const team of await this.getTeams()) {
        for await (const member of this.getTeamMembershipsFromCloud(team.id)) {
          yield {teamId: team.id, memberId: member.id};
        }
      }
      return;
    }
    yield* this.getTeamMembershipsFromServer();
  }

  async *getTeamMembershipsFromCloud(
    teamId: string
  ): AsyncIterableIterator<User> {
    let cursor: string | undefined = undefined;
    let hasNext = true;
    do {
      const response = await this.api.getTeamMemberships(
        this.organizationId,
        teamId,
        MAX_TEAMS_RESULTS,
        cursor
      );
      cursor = response.pageInfo.endCursor;
      hasNext = response.pageInfo.hasNextPage;
      for (const user of response.results) {
        yield {id: user.accountId};
      }
    } while (hasNext);
  }

  async *getTeamMembershipsFromServer(): AsyncIterableIterator<TeamMembership> {
    const teamMemberships = this.iterate(
      (startAt) => this.api.getResources(startAt + 1, MAX_TEAMS_RESULTS),
      async (item: any) => {
        const teamId = toString(item.teamId);
        const person = await this.api.getPerson(item.person.id);
        const memberId = person.jiraUser.jiraUserId;
        return {
          teamId,
          memberId,
        };
      }
    );

    for await (const teamMembership of teamMemberships) {
      yield teamMembership;
    }
  }

  getClientStats(): {[key: string]: number} {
    return this.api.getStats();
  }

  async *getAuditRecords(
    from?: Date,
    to?: Date,
    filter?: string
  ): AsyncIterableIterator<Version2Models.AuditRecord> {
    yield* this.iterate(
      (startAt) =>
        this.api.v2.auditRecords.getAuditRecords({
          offset: startAt,
          limit: this.maxPageSize,
          from: from?.toISOString(),
          to: to?.toISOString(),
          filter,
        }),
      async (record: Version2Models.AuditRecord) => record,
      'records'
    );
  }
}
