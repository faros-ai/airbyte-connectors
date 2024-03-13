import axios, {AxiosInstance} from 'axios';
import {setupCache} from 'axios-cache-interceptor';
import {AirbyteConfig, AirbyteLogger} from 'faros-airbyte-cdk';
import {Utils, wrapApiError} from 'faros-js-client';
import parseGitUrl from 'git-url-parse';
import https from 'https';
import jira from 'jira.js';
import {Board} from 'jira.js/out/agile/models/board';
import {Project} from 'jira.js/out/version2/models';
import {concat, isNil, sum, toLower} from 'lodash';
import pLimit from 'p-limit';
import {Memoize} from 'typescript-memoize';
import {VError} from 'verror';

import {JiraClient} from './client';
import {Issue, PullRequest, Repo, RepoSource, SprintReport} from './models';

export interface JiraConfig extends AirbyteConfig {
  readonly url: string;
  readonly username?: string;
  readonly password?: string;
  readonly token?: string;
  readonly syncAdditionalFields: boolean;
  readonly additionalFields: ReadonlyArray<string>;
  readonly additionalFieldsArrayLimit: number;
  readonly rejectUnauthorized: boolean;
  readonly concurrencyLimit: number;
  readonly maxRetries: number;
  readonly maxPageSize: number;
  readonly timeout: number;
  readonly useUsersPrefixSearch?: boolean;
  readonly projectKeys?: ReadonlyArray<string>;
  readonly cutoffDays?: number;
  readonly cutoffLagDays?: number;
  readonly boardIds?: ReadonlyArray<string>;
}

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
const EPIC_TYPE_NAME = 'Epic';

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

const sprintRegex = /([\w]+)=([\w-:. ]+)/g;
const jiraCloudRegex = /^https:\/\/(.*).atlassian.net/g;

const MAX_SPRINT_HISTORY_FETCH_FAILURES = 5;

export const DEFAULT_CONCURRENCY_LIMIT = 5;
export const DEFAULT_CUTOFF_DAYS = 90;
export const DEFAULT_CUTOFF_LAG_DAYS = 0;
export const DEFAULT_TIMEOUT = 120000; // 120 seconds

export class Jira {
  private readonly fieldIdsByName: Map<string, string[]>;
  // Counts the number of failes calls to fetch sprint history
  private sprintHistoryFetchFailures = 0;

  constructor(
    // Pass base url to enable creating issue url that can navigated in browser
    // https://community.atlassian.com/t5/Jira-questions/How-can-I-get-an-issue-url-that-can-be-navigated-to-in-the/qaq-p/1500948
    private readonly baseURL: string,
    private readonly api: JiraClient,
    private readonly http: AxiosInstance,
    private readonly fieldNameById: Map<string, string>,
    private readonly isCloud: boolean,
    private readonly concurrencyLimit: number = DEFAULT_CONCURRENCY_LIMIT,
    private readonly maxPageSize: number,
    private readonly logger: AirbyteLogger
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
    const isCloud = cfg.url.match(jiraCloudRegex) != null;
    const jiraType = isCloud ? 'Cloud' : 'Server/DC';
    logger?.debug(`Assuming ${cfg.url} to be a Jira ${jiraType} instance`);

    const authentication = Jira.auth(cfg);
    const httpsAgent = new https.Agent({
      rejectUnauthorized: cfg.rejectUnauthorized,
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
        timeout: cfg.timeout,
      },
      maxRetries: cfg.maxRetries,
      logger: logger,
    });

    const addAllFields =
      cfg.syncAdditionalFields && !cfg.additionalFields.length;
    const additionalFields = new Set(
      cfg.syncAdditionalFields ? cfg.additionalFields : []
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

    return new Jira(
      cfg.url,
      api,
      http,
      fieldNameById,
      isCloud,
      cfg.concurrencyLimit,
      cfg.maxPageSize,
      logger
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
  async *getProjects(): AsyncIterableIterator<Project> {
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
          type: item.type,
        })
      );
      for await (const project of projects) {
        yield project;
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
    const browseableProjects: Project[] = [];
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
      yield project;
    }
  }

  async getProject(id: string): Promise<Project> {
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

  async getProjectsByKey(): Promise<Map<string, Project>> {
    const projectsByKey = new Map<string, Project>();
    for await (const project of this.getProjects()) {
      projectsByKey.set(project.key, project);
    }
    return projectsByKey;
  }

  @Memoize()
  getIssues(
    projectId: string,
    syncPullRequests: boolean,
    updateRange?: [Date, Date],
    fetchKeysOnly = false,
    includeAdditionalFields = true,
    additionalFields?: string[]
  ): AsyncIterableIterator<Issue> {
    let jql = `project = "${projectId}"`;
    if (updateRange) {
      jql += ` AND ${Jira.updatedBetweenJql(updateRange)}`;
    }
    const fields = this.getIssueFields(
      fetchKeysOnly,
      includeAdditionalFields,
      additionalFields
    );
    return this.iterate(
      (startAt) =>
        this.api.v2.issueSearch.searchForIssuesUsingJql({
          jql,
          startAt,
          fields,
          expand: fetchKeysOnly ? undefined : 'changelog',
          maxResults: this.maxPageSize,
        }),
      async (item: any) => {
        let pullRequests: ReadonlyArray<PullRequest> = [];
        if (syncPullRequests) {
          const devFieldIds = this.fieldIdsByName.get(DEV_FIELD_NAME) ?? [];
          for (const devFieldId of devFieldIds) {
            if (
              pullRequests.length === 0 &&
              Jira.hasPullRequests(item.fields[devFieldId])
            ) {
              try {
                pullRequests = await this.getPullRequests(item.id);
                this.logger?.debug(
                  `Fetched ${pullRequests.length} pull requests for issue ${item.key}`
                );
              } catch (err: any) {
                this.logger?.warn(
                  `Failed to get pull requests for issue ${item.key}: ${err.message}`
                );
              }
            }
          }
        }
        return {
          id: item.id,
          key: item.key,
          created: Utils.toDate(item.fields.created),
          updated: Utils.toDate(item.fields.updated),
          pullRequests,
        };
      },
      'issues'
    );
  }

  private getIssueFields(
    fetchKeysOnly: boolean,
    includeAdditionalFields: boolean,
    additionalFields?: string[]
  ): string[] {
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
      return [...fieldIds, ...additionalFieldIds];
    }
    return fieldIds;
  }

  getBoards(projectId: string): AsyncIterableIterator<Board> {
    return this.iterate(
      (startAt) =>
        this.api.agile.board.getAllBoards({
          projectKeyOrId: projectId,
          startAt,
          maxResults: this.maxPageSize,
        }),
      (item: any) => ({
        id: item.id,
        key: item.key,
        name: item.name,
        type: item.type,
      })
    );
  }

  getSprintReports(
    boardId: string,
    range?: [Date, Date]
  ): AsyncIterableIterator<SprintReport> {
    return this.iterate(
      (startAt) =>
        this.api.agile.board.getAllSprints({
          boardId: Utils.parseInteger(boardId),
          startAt,
          maxResults: this.maxPageSize,
        }),
      async (item: any) => {
        const completeDate = Utils.toDate(item.completeDate);
        // Ignore sprints completed before the input date range cutoff date
        if (range && completeDate && completeDate < range[0]) {
          return;
        }
        let report;
        try {
          if (
            this.sprintHistoryFetchFailures <
              MAX_SPRINT_HISTORY_FETCH_FAILURES &&
            toLower(item.state) != 'future'
          ) {
            report = await this.api.getSprintReport(boardId, item.id);
            this.sprintHistoryFetchFailures = 0;
          }
        } catch (err: any) {
          this.logger?.warn(
            `Failed to get sprint report for sprint ${item.id}: ${err.message}`
          );
          if (
            this.sprintHistoryFetchFailures++ >=
            MAX_SPRINT_HISTORY_FETCH_FAILURES
          ) {
            this.logger?.warn(
              `Disabling fetching sprint history, since it has failed ${this.sprintHistoryFetchFailures} times in a row`
            );
          }
        }
        return this.toSprintReportFields(report?.contents, item);
      }
    );
  }

  private toSprintReportFields(report: any, sprint: any): SprintReport {
    if (!report) {
      return;
    }
    const toFloat = (value: any): number | undefined => {
      if (isNil(value)) {
        return undefined;
      }
      return Utils.parseFloatFixedPoint(value);
    };
    const plannedPoints = sum([
      toFloat(report?.completedIssuesInitialEstimateSum?.value),
      toFloat(report?.issuesNotCompletedInitialEstimateSum?.value),
      toFloat(report?.puntedIssuesInitialEstimateSum?.value),
      toFloat(report?.issuesCompletedInAnotherSprintInitialEstimateSum?.value),
    ]);

    return {
      id: sprint.id,
      completedAt: Utils.toDate(sprint.completeDate),
      completedPoints: toFloat(report?.completedIssuesEstimateSum?.value),
      notCompletedPoints: toFloat(report?.issuesNotCompletedEstimateSum?.value),
      puntedPoints: toFloat(report?.puntedIssuesEstimateSum?.value),
      completedInAnotherSprintPoints: toFloat(
        report?.issuesCompletedInAnotherSprintEstimateSum?.value
      ),
      plannedPoints,
    };
  }
}
