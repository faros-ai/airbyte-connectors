import axios, {AxiosInstance} from 'axios';
import {setupCache} from 'axios-cache-interceptor';
import {AirbyteConfig, AirbyteLogger} from 'faros-airbyte-cdk';
import {bucket} from 'faros-airbyte-common/common';
import {
  Issue,
  IssueField,
  PullRequest,
  Repo,
  RepoSource,
  SprintIssue,
  SprintReport,
  Status,
} from 'faros-airbyte-common/jira';
import {FarosClient, Utils, wrapApiError} from 'faros-js-client';
import * as fs from 'fs';
import parseGitUrl from 'git-url-parse';
import https from 'https';
import jira, {AgileModels, Version2Models} from 'jira.js';
import {concat, isNil, pick, toLower} from 'lodash';
import {isEmpty} from 'lodash';
import pLimit from 'p-limit';
import path from 'path';
import {Memoize} from 'typescript-memoize';
import {VError} from 'verror';

import {JiraClient} from './client';
import {IssueTransformer} from './issue_transformer';
import {RunMode} from './streams/common';

export interface JiraConfig extends AirbyteConfig {
  readonly url: string;
  readonly username?: string;
  readonly password?: string;
  readonly token?: string;
  readonly sync_additional_fields?: boolean;
  readonly additional_fields?: ReadonlyArray<string>;
  readonly additional_fields_array_limit?: number;
  readonly reject_unauthorized?: boolean;
  readonly concurrency_limit?: number;
  readonly max_retries?: number;
  readonly page_size?: number;
  readonly timeout?: number;
  readonly use_users_prefix_search?: boolean;
  readonly projects?: ReadonlyArray<string>;
  readonly cutoff_days?: number;
  readonly cutoff_lag_days?: number;
  readonly boards?: ReadonlyArray<string>;
  readonly run_mode?: RunMode;
  readonly bucket_id?: number;
  readonly bucket_total?: number;
  readonly api_url?: string;
  readonly api_key?: string;
  readonly graph?: string;
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

const jiraCloudRegex = /^https:\/\/(.*).atlassian.net/g;
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

const BOARD_QUERY = fs.readFileSync(
  path.join(__dirname, '..', 'resources', 'queries', 'tms-board.gql'),
  'utf8'
);

const DEFAULT_ADDITIONAL_FIELDS_ARRAY_LIMIT = 50;
const DEFAULT_REJECT_UNAUTHORIZED = true;
const DEFAULT_CONCURRENCY_LIMIT = 5;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_PAGE_SIZE = 250;
const DEFAULT_TIMEOUT = 120000; // 2 minutes
const DEFAULT_USE_USERS_PREFIX_SEARCH = false;
export const DEFAULT_CUTOFF_DAYS = 90;
export const DEFAULT_CUTOFF_LAG_DAYS = 0;
const DEFAULT_BUCKET_ID = 1;
const DEFAULT_BUCKET_TOTAL = 1;
export const DEFAULT_API_URL = 'https://prod.api.faros.ai';
export const DEFAULT_GRAPH = 'default';

export class Jira {
  private readonly fieldIdsByName: Map<string, string[]>;
  // Counts the number of failed calls to fetch sprint history
  private sprintHistoryFetchFailures = 0;

  constructor(
    // Pass base url to enable creating issue url that can navigated in browser
    // https://community.atlassian.com/t5/Jira-questions/How-can-I-get-an-issue-url-that-can-be-navigated-to-in-the/qaq-p/1500948
    private readonly baseURL: string,
    private readonly api: JiraClient,
    private readonly http: AxiosInstance,
    private readonly fieldNameById: Map<string, string>,
    private readonly additionalFieldsArrayLimit: number,
    private readonly statusByName: Map<string, Status>,
    private readonly isCloud: boolean,
    private readonly concurrencyLimit: number,
    private readonly maxPageSize: number,
    private readonly bucketId: number,
    private readonly bucketTotal: number,
    private readonly logger: AirbyteLogger,
    private readonly useUsersPrefixSearch?: boolean
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
    if (isEmpty(cfg.url)) {
      throw new VError('Please provide a Jira URL');
    }

    const isCloud = cfg.url.match(jiraCloudRegex) != null;
    const jiraType = isCloud ? 'Cloud' : 'Server/DC';
    logger?.debug(`Assuming ${cfg.url} to be a Jira ${jiraType} instance`);

    const authentication = Jira.auth(cfg);

    this.validateBucketingConfig(cfg);

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
        },
        timeout: cfg.timeout ?? DEFAULT_TIMEOUT,
      },
      maxRetries: cfg.max_retries ?? DEFAULT_MAX_RETRIES,
      logger: logger,
    });

    const addAllFields =
      cfg.sync_additional_fields && (cfg.additional_fields ?? []).length === 0;
    const additionalFields = new Set(
      cfg.sync_additional_fields ? cfg.additional_fields ?? [] : []
    );
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
    for (const status of await api.v2.workflowStatuses.getStatuses()) {
      if (status.name && status.statusCategory?.name) {
        statusByName.set(status.name, {
          category: status.statusCategory.name,
          detail: status.name,
        });
      }
    }

    return new Jira(
      cfg.url,
      api,
      http,
      fieldNameById,
      cfg.additional_fields_array_limit ??
        DEFAULT_ADDITIONAL_FIELDS_ARRAY_LIMIT,
      statusByName,
      isCloud,
      cfg.concurrency_limit ?? DEFAULT_CONCURRENCY_LIMIT,
      cfg.page_size ?? DEFAULT_PAGE_SIZE,
      cfg.bucket_id ?? DEFAULT_BUCKET_ID,
      cfg.bucket_total ?? DEFAULT_BUCKET_TOTAL,
      logger,
      cfg.use_users_prefix_search ?? DEFAULT_USE_USERS_PREFIX_SEARCH
    );
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

  private static validateBucketingConfig(config: JiraConfig): void {
    const bucketTotal = config.bucket_total ?? 1;
    if (bucketTotal < 1) {
      throw new VError('bucket_total must be a positive integer');
    }
    const bucketId = config.bucket_id ?? 1;
    if (bucketId < 1 || bucketId > bucketTotal) {
      throw new VError(`bucket_id must be between 1 and ${bucketTotal}`);
    }
  }

  private static updatedBetweenJql(range: [Date, Date]): string {
    const [from, to] = range;
    if (to < from) {
      throw new VError(
        `invalid update range: end timestamp '${to}' ` +
          `is strictly less than start timestamp '${from}'`
      );
    }
    return `updated >= ${from.getTime()} AND updated < ${to.getTime()}`;
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

  @Memoize()
  async *getProjects(): AsyncIterableIterator<Version2Models.Project> {
    if (this.isCloud) {
      const projects = this.iterate(
        (startAt) =>
          this.api.v2.projects.searchProjects({
            expand: 'description',
            action: 'browse',
            startAt,
            maxResults: this.maxPageSize,
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
      return;
    }

    // Jira Server doesn't support searchProjects API, use getAllProjects
    // Get all projects returns all projects which are visible for the user
    // i.e. where the user has any of one of Browse Projects,
    // Administer Projects, Administer Jira permissions. To view issues the
    // user should have `BROWSE_PROJECTS` permissions on the project, so check
    // that permission is granted for the user using mypermissions endpoint.
    const skippedProjects: string[] = [];
    const browseableProjects: Version2Models.Project[] = [];
    for await (const project of await this.api.getAllProjects()) {
      try {
        const hasPermission = await this.hasBrowseProjectPerms(project.key);
        if (!hasPermission) {
          skippedProjects.push(project.key);
          continue;
        }
        browseableProjects.push(project);
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
    for (const project of browseableProjects) {
      if (this.isProjectInBucket(project.key)) yield project;
    }
  }

  async *getProjectsFromGraph(
    farosClient: FarosClient,
    graph: string
  ): AsyncIterableIterator<Version2Models.Project> {
    const projects = this.iterate(
      async (startAt) => {
        const data = await farosClient.gql(graph, PROJECT_QUERY, {
          source: 'Jira',
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

    const hasPermission = await this.hasBrowseProjectPerms(project.key);
    if (!hasPermission) {
      throw new VError('Insufficient permissions for project: %s', project.key);
    }

    return project;
  }

  @Memoize()
  async hasBrowseProjectPerms(projectKey: string): Promise<boolean> {
    const perms = await this.api.v2.permissions.getMyPermissions({
      permissions: BROWSE_PROJECTS_PERM,
      projectKey,
    });

    return perms?.permissions?.[BROWSE_PROJECTS_PERM]?.['havePermission'];
  }
  @Memoize()
  async getStatuses(): Promise<Map<string, Status>> {
    const statusByName = new Map<string, Status>();
    for (const status of await this.api.v2.workflowStatuses.getStatuses()) {
      if (status.name && status.statusCategory?.name) {
        statusByName.set(status.name, {
          category: status.statusCategory.name,
          detail: status.name,
        });
      }
    }
    return statusByName;
  }

  @Memoize()
  getIssues(
    jql: string,
    fetchKeysOnly = false,
    includeAdditionalFields = true,
    additionalFields?: string[]
  ): AsyncIterableIterator<Issue> {
    const {fieldIds, additionalFieldIds} = this.getIssueFields(
      fetchKeysOnly,
      includeAdditionalFields,
      additionalFields
    );
    const issueTransformer = new IssueTransformer(
      this.baseURL,
      this.fieldNameById,
      this.fieldIdsByName,
      this.statusByName,
      additionalFieldIds,
      this.additionalFieldsArrayLimit
    );
    return this.iterate(
      (startAt) =>
        this.api.v2.issueSearch.searchForIssuesUsingJql({
          jql,
          startAt,
          fields: [...fieldIds, ...additionalFieldIds],
          expand: fetchKeysOnly ? undefined : 'changelog',
          maxResults: this.maxPageSize,
        }),
      async (item: any) => {
        return issueTransformer.toIssue(item);
      },
      'issues'
    );
  }

  async getIssuePullRequests(
    issue: Issue
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

  private getIssueFields(
    fetchKeysOnly: boolean,
    includeAdditionalFields: boolean,
    additionalFields?: string[]
  ): {fieldIds: string[]; additionalFieldIds: string[]} {
    const fieldIds = fetchKeysOnly
      ? ['id', 'key', 'created', 'updated']
      : [
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
        ];
    if (includeAdditionalFields) {
      const additionalFieldIds: string[] = [];
      for (const fieldId of this.fieldNameById.keys()) {
        // Skip fields that are already included in the fields above,
        // or that are not in the additional fields list if provided
        if (
          !fieldIds.includes(fieldId) &&
          (!additionalFields ||
            additionalFields.includes(this.fieldNameById.get(fieldId)))
        ) {
          additionalFieldIds.push(fieldId);
        }
      }
      return {fieldIds, additionalFieldIds};
    }
    return {fieldIds, additionalFieldIds: []};
  }

  async *getBoards(
    projectId?: string
  ): AsyncIterableIterator<AgileModels.Board> {
    const boards = this.iterate(
      (startAt) =>
        this.api.agile.board.getAllBoards({
          startAt,
          maxResults: this.maxPageSize,
          ...(projectId && {projectKeyOrId: projectId}),
        }),
      (item: AgileModels.Board) => item
    );
    for await (const board of boards) {
      const boardProject = board?.location?.projectKey;
      if (boardProject && this.isProjectInBucket(boardProject)) yield board;
    }
  }

  async *getBoardsFromGraph(
    farosClient: FarosClient,
    graph: string
  ): AsyncIterableIterator<AgileModels.Board> {
    const boards = this.iterate(
      async (startAt) => {
        const data = await farosClient.gql(graph, BOARD_QUERY, {
          source: 'Jira',
          offset: startAt,
          pageSize: this.maxPageSize,
        });
        return data?.tms_TaskBoard;
      },
      async (item: any) => {
        return {
          id: item.uid,
          projectsKeys:
            item.projects?.map((project: any) => project.project.uid) ?? [],
        };
      }
    );
    for await (const board of boards) {
      if (
        board.projectsKeys.some((projectKey: string) =>
          this.isProjectInBucket(projectKey)
        )
      )
        yield board;
    }
  }

  getBoard(id: string): Promise<AgileModels.Board> {
    const boardId = Utils.parseInteger(id);
    return this.api.agile.board.getBoard({boardId});
  }

  @Memoize()
  getSprints(
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

  getSprintsFromFarosGraph(
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
      async (item: any) => {
        return {
          id: item.sprint.uid,
          name: item.sprint.name,
          state: item.sprint.state,
          completeDate: item.sprint.closedAt,
        };
      }
    );
  }

  async getSprintReport(
    sprint: AgileModels.Sprint,
    boardId: string
  ): Promise<SprintReport> {
    let report;
    try {
      if (
        this.sprintHistoryFetchFailures < MAX_SPRINT_HISTORY_FETCH_FAILURES &&
        toLower(sprint.state) != 'future'
      ) {
        report = await this.api.getSprintReport(boardId, sprint.id);
        this.sprintHistoryFetchFailures = 0;
      }
    } catch (err: any) {
      this.logger?.warn(
        `Failed to get sprint report for sprint ${sprint.id}: ${err.message}`
      );
      if (
        this.sprintHistoryFetchFailures++ >= MAX_SPRINT_HISTORY_FETCH_FAILURES
      ) {
        this.logger?.warn(
          `Disabling fetching sprint history, since it has failed ${this.sprintHistoryFetchFailures} times in a row`
        );
      }
    }
    return this.toSprintReportFields(report?.contents, sprint);
  }

  private toSprintReportFields(
    report: any,
    sprint: AgileModels.Sprint
  ): SprintReport {
    if (!report) {
      return;
    }
    return {
      id: sprint.id,
      closedAt: Utils.toDate(sprint.completeDate),
      issues: this.toSprintReportIssues(report),
    };
  }

  toSprintReportIssues(report: any): SprintIssue[] {
    const toSprintIssues = (issues, status): any[] =>
      issues?.map((issue) => {
        return {
          key: issue.key,
          status,
          points: toFloat(
            issue.currentEstimateStatistic?.statFieldValue?.value
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

  async isBoardInBucket(boardId: string): Promise<boolean> {
    const board = await this.getBoard(boardId);
    const boardProject = board?.location?.projectKey;
    return boardProject && this.isProjectInBucket(boardProject);
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
    this.logger?.debug("Searching for users with username '%s'", username);
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

    // Try searching users by a single character prefix first
    for (const prefix of PREFIX_CHARS) {
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
      // Since we got exactly 1000 results back we are probably hitting
      // the limit of Jira search API. Let's try searching by two character prefix
      // https://jira.atlassian.com/browse/JRASERVER-65089
      if (userCount === 1000) {
        for (const prefix2 of PREFIX_CHARS) {
          const res = this.findUsers(prefix + prefix2);
          for await (const u of res) {
            const uid = this.userId(u);
            if (!seenUsers.has(uid)) {
              seenUsers.add(uid);
              yield u;
            }
          }
        }
      }
    }
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
}
