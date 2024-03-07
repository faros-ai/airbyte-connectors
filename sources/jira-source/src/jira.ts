import axios, {AxiosInstance} from 'axios';
import {setupCache} from 'axios-cache-interceptor';
import {AirbyteConfig, AirbyteLogger} from 'faros-airbyte-cdk';
import {Utils, wrapApiError} from 'faros-js-client';
import parseGitUrl from 'git-url-parse';
import https from 'https';
import jira from 'jira.js';
import {
  concat,
  difference,
  isNil,
  isPlainObject,
  isString,
  sum,
  toLower,
  toString,
} from 'lodash';
import pLimit from 'p-limit';
import path from 'path';
import {Memoize} from 'typescript-memoize';
import {VError} from 'verror';

import {JiraClient} from './client';

// TODO - Remove our models and use models in jira.js package
export interface Project {
  readonly id?: string;
  readonly key?: string;
  readonly name?: string;
  readonly description?: string;
  readonly archived?: boolean;
}

export interface Issue {
  readonly id: string;
  readonly key: string;
  readonly type: string;
  readonly status: Status;
  readonly creator: string;
  readonly created?: Date;
  readonly updated?: Date;
  readonly project: string;
  readonly priority: string;
  readonly labels: ReadonlyArray<string>;
  readonly dependencies: ReadonlyArray<Dependency>;
  readonly subtasks: ReadonlyArray<string>;
  readonly parent?: Parent;
  readonly statusChanged?: Date;
  readonly statusChangelog: ReadonlyArray<[Status, Date]>;
  readonly keyChangelog: ReadonlyArray<[string, Date]>;
  readonly summary?: string;
  readonly description?: string;
  readonly assignees?: ReadonlyArray<Assignee>;
  readonly assigned?: Date;
  readonly pullRequests: ReadonlyArray<PullRequest>;
  readonly points?: number;
  readonly epic?: string;
  readonly sprintInfo?: SprintInfo;
  readonly additionalFields: ReadonlyArray<[string, string]>;
  readonly url: string;
  readonly resolution: string;
  readonly resolutionDate: Date;
}

interface Parent {
  key: string;
  type?: string;
}

export interface Dependency {
  readonly key: string;
  readonly inward: string;
  readonly outward: string;
}

export interface Status {
  readonly category: string;
  readonly detail: string;
}

export interface Assignee {
  readonly uid: string;
  readonly assignedAt: Date;
}

interface SprintHistory {
  readonly uid: string;
  readonly addedAt: Date;
  readonly removedAt?: Date;
}

export interface SprintInfo {
  readonly currentSprintId: string;
  readonly history: ReadonlyArray<SprintHistory>;
}

export enum RepoSource {
  BITBUCKET = 'Bitbucket',
  GITHUB = 'GitHub',
  GIT_FOR_JIRA_CLOUD = 'GitForJiraCloud',
  GITLAB = 'GitLab',
  VCS = 'VCS',
}

export interface Repo {
  readonly source: RepoSource;
  readonly org: string;
  readonly name: string;
}

export interface PullRequestIssue {
  readonly key: string;
  readonly updated: Date;
  readonly project: string;
}
export interface PullRequest {
  readonly repo: Repo;
  readonly number: number;
  readonly issue?: PullRequestIssue;
}

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
}

// Check for field name differences between classic and next-gen projects
// for fields to promote to top-level fields.
// https://community.atlassian.com/t5/Jira-Software-questions/Story-point-and-story-point-estimate-duplicate-fields/qaq-p/904742
const DEV_FIELD_NAME = 'Development';
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
    private readonly statusByName: Map<string, Status>,
    private readonly isCloud: boolean,
    private readonly concurrencyLimit: number = DEFAULT_CONCURRENCY_LIMIT,
    private readonly maxPageSize: number,
    private readonly additionalFieldsArrayLimit: number,
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

    const statusByName = new Map<string, Status>();
    for (const status of await api.v2.workflowStatuses.getStatuses()) {
      if (status.name && status.statusCategory?.name) {
        statusByName.set(status.name, {
          category: status.statusCategory.name,
          detail: status.name,
        });
      }
    }

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
      statusByName,
      isCloud,
      cfg.concurrencyLimit,
      cfg.maxPageSize,
      cfg.additionalFieldsArrayLimit,
      logger,
      cfg.useUsersPrefixSearch
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

  private static assigneeChangelog(
    changelog: ReadonlyArray<any>,
    currentAssignee: any,
    created: Date
  ): ReadonlyArray<Assignee> {
    const assigneeChangelog: Array<Assignee> = [];

    const assigneeChanges = Jira.fieldChangelog(
      changelog,
      'assignee',
      'from',
      'to'
    );

    if (assigneeChanges.length) {
      // case where task was already assigned at creation
      const firstChange = assigneeChanges[0];
      if (firstChange.from) {
        const assignee = {uid: firstChange.from, assignedAt: created};
        assigneeChangelog.push(assignee);
      }

      for (const change of assigneeChanges) {
        const assignee = {uid: change.value, assignedAt: change.changed};
        assigneeChangelog.push(assignee);
      }
    } else if (currentAssignee) {
      // if task was assigned at creation and never changed
      assigneeChangelog.push({uid: currentAssignee, assignedAt: created});
    }
    return assigneeChangelog;
  }

  private statusChangelog(
    changelog: ReadonlyArray<any>,
    currentStatus: string,
    created: Date
  ): ReadonlyArray<[Status, Date]> {
    const statusChangelog: Array<[Status, Date]> = [];

    const pushStatusChange = (statusName: string, date: Date): void => {
      const status = this.statusByName.get(statusName);
      if (status) statusChangelog.push([status, date]);
    };

    const statusChanges = Jira.fieldChangelog(changelog, 'status');

    if (statusChanges.length) {
      // status that was assigned at creation
      const firstChange = statusChanges[0];
      if (firstChange.from) {
        pushStatusChange(firstChange.from, created);
      }
      for (const change of statusChanges) {
        pushStatusChange(change.value, change.changed);
      }
    } else if (currentStatus) {
      // if task was given status at creation and never changed
      pushStatusChange(currentStatus, created);
    }
    return statusChangelog;
  }

  private static fieldChangelog(
    changelog: ReadonlyArray<any>,
    field: string,
    fromField = 'fromString',
    valueField = 'toString'
  ): ReadonlyArray<{
    from: string;
    field: string;
    value: string;
    changed: Date;
    typeChange?: {from: string; to: string};
  }> {
    const fieldChangelog = [];
    // Changelog entries are sorted from least to most recent
    for (const change of changelog) {
      const typeChange = Jira.getIssueChangeType(change.items);
      for (const item of change.items) {
        if (item.field === field) {
          const changed = Utils.toDate(change.created);
          if (!changed) {
            continue;
          }
          fieldChangelog.push({
            from: item[fromField],
            field,
            value: item[valueField],
            changed,
            typeChange,
          });
        }
      }
    }
    return fieldChangelog;
  }

  private static getIssueChangeType(
    items: ReadonlyArray<any>
  ): {from: string; to: string} | undefined {
    for (const item of items) {
      if (item.field === 'issuetype') {
        return {from: item.fromString, to: item.toString};
      }
    }
  }

  private static getSprintFromField(
    sprints: any,
    current?: ReadonlyArray<string>
  ): string | undefined {
    // Sort array in descending order of sprint completeDate and return the first
    // one. Future sprints / active may not have end dates but will take precedence.
    const ctx = current
      ? sprints.filter((s) => current.includes(s.id))
      : sprints;
    const sprint = ctx.find((s) => {
      const state = toLower(s.state);
      return state === 'future' || state === 'active';
    });
    if (sprint) {
      return sprint.id;
    }
    ctx.sort((l, r) => {
      const lDate = +(Utils.toDate(l.completeDate) || new Date(0));
      const rDate = +(Utils.toDate(r.completeDate) || new Date(0));
      return rDate - lDate;
    });
    return toString(ctx[0]?.id);
  }

  private sprintHistory(
    key: string,
    changelog: ReadonlyArray<any>,
    sprints: ReadonlyArray<any>,
    created: Date,
    type: string
  ): SprintInfo {
    const sprintChanges = Jira.fieldChangelog(
      changelog,
      'Sprint',
      'from',
      'to'
    );

    // Sub-tasks which never had any sprint changes should be ignored
    if (type === 'Sub-task' && !sprintChanges.length) {
      return;
    }
    const sprintHistory = [];
    const sprintAtCreation = Jira.getSprintFromField(sprints);
    // When sprint was assigned at task creation but no changes after
    // use the sprint from the sprint field
    if (!sprintChanges.length && sprintAtCreation) {
      return {
        currentSprintId: sprintAtCreation,
        history: [{uid: sprintAtCreation, addedAt: created}],
      };
    }

    let currentSprint;
    let hasInheritedSprint = false;
    // Sprint field value is a list
    let currentSprintValue: string[] = Utils.toStringList(
      sprintChanges[0]?.from
    );
    const initialChangedAt = new Date(sprintChanges[0]?.changed);
    // When sprint was already assigned at creation, use the sprint which
    // it has now changed from
    if (currentSprintValue.length == 1) {
      currentSprint = {uid: currentSprintValue[0], addedAt: created};
    } else if (currentSprintValue.length > 1) {
      // If the first change has multiple sprints compute the sprint
      // from the sprint field
      const sprint = Jira.getSprintFromField(sprints, currentSprintValue);
      currentSprint = {uid: sprint, addedAt: initialChangedAt};
    }

    for (const change of sprintChanges ?? []) {
      currentSprintValue =
        currentSprintValue ?? Utils.toStringList(change.from);
      const newSprintValue = Utils.toStringList(change.value);

      // FAI-2742, FAI-8034: When an issue changes from sub-task, there are
      // instances the changelog reflects the sprint being set to empty.
      // Ignore this as the new task remains in the same sprint.
      const typeChange = change?.typeChange;
      if (typeChange?.from === 'Sub-task') {
        currentSprintValue = undefined;
        hasInheritedSprint = false;
        continue;
      } else if (typeChange?.to === 'Sub-task') {
        // FAI-2742: When an issue changes to sub-task, it inherits the sprint of the
        // parent task. Changelog no longer reflects the sprint changes from the
        // sprint. Will mark it as removed from the sprint
        hasInheritedSprint = true;
      }

      if (currentSprint) {
        currentSprint.removedAt = change.changed;
        sprintHistory.push(currentSprint);
        currentSprint = undefined;
        if (hasInheritedSprint) {
          hasInheritedSprint = false;
          currentSprintValue = undefined;
          continue;
        }
      }

      // When a sprint is removed to a future sprint, the new value is not
      // always appended to end of the list, get from difference of sprint values
      const diff = difference(newSprintValue, currentSprintValue);
      if (diff.length > 1) {
        this.logger?.warn(
          `Issue ${key} sprint difference from ${currentSprintValue} to ` +
            `${newSprintValue} has more one value: ${diff.join(',')}. ` +
            `Will be marked as removed from current sprint`
        );
      } else if (diff[0]) {
        currentSprint = {uid: diff[0], addedAt: change.changed};
      }
      currentSprintValue = undefined;
    }

    // Add current sprint to sprint history
    if (currentSprint) {
      sprintHistory.push(currentSprint);
    }
    return {
      currentSprintId: currentSprint?.uid,
      history: Jira.uniqueSprintHistory(sprintHistory),
    };
  }

  // Filter out duplicate sprint history entries when task moves to same sprint
  // multiple times
  private static uniqueSprintHistory(
    sprintHistory: ReadonlyArray<SprintHistory>
  ): ReadonlyArray<SprintHistory> {
    const uniqueSprints: Record<string, SprintHistory> = {};

    // Iterate through the list to update with most recent
    sprintHistory.forEach((s) => {
      const existingSprint = uniqueSprints[s.uid];

      if (!existingSprint || s.addedAt > existingSprint.addedAt) {
        uniqueSprints[s.uid] = s;
      }
    });

    return Object.values(uniqueSprints);
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

  private getPoints(item: {
    key: string;
    fields: {[f: string]: any};
  }): number | undefined {
    for (const fieldName of POINTS_FIELD_NAMES) {
      const fieldIds = this.fieldIdsByName.get(fieldName) ?? [];
      for (const fieldId of fieldIds) {
        const pointsString = item.fields[fieldId];
        if (!isNil(pointsString)) {
          let points;
          try {
            points = Utils.parseFloatFixedPoint(pointsString);
          } catch (err: any) {
            this.logger?.warn(
              `Failed to get story points for issue ${item.key}: ${err.message}`
            );
          }
          return points;
        }
      }
    }
    return undefined;
  }

  private getIssueEpic(item: {fields: {[f: string]: any}}): string | undefined {
    for (const id of this.fieldIdsByName.get(EPIC_LINK_FIELD_NAME) ?? []) {
      const epic = item.fields[id];
      if (epic) {
        return epic.toString();
      }
    }
    if (item.fields.issuetype?.name === EPIC_TYPE_NAME) {
      return item['key'];
    }
    return undefined;
  }

  private getIssueSprints(item: {fields: {[f: string]: any}}): any[] {
    const sprints = [];
    for (const fieldId of this.fieldIdsByName.get(SPRINT_FIELD_NAME) ?? []) {
      for (const sprint of item.fields[fieldId] ?? []) {
        // Workaround for string representation of sprint details which are supposedly deprecated
        // https://developer.atlassian.com/cloud/jira/platform/deprecation-notice-tostring-representation-of-sprints-in-get-issue-response/
        if (typeof sprint === 'string') {
          let match;
          const details = {};
          while ((match = sprintRegex.exec(sprint)) !== null) {
            details[match[1]] = match[2];
          }
          sprints.push(details);
        } else if (isPlainObject(sprint)) {
          sprints.push({
            id: sprint.id?.toString(),
            state: sprint.state,
            startDate: sprint.startDate,
            endDate: sprint.endDate,
            completeDate: sprint.completeDate,
          });
        }
      }
    }
    return sprints;
  }

  @Memoize()
  getIssues(
    projectId: string,
    syncPullRequests: boolean,
    updateRange?: [Date, Date]
  ): AsyncIterableIterator<Issue> {
    let jql = `project = "${projectId}"`;
    if (updateRange) {
      jql += ` AND ${Jira.updatedBetweenJql(updateRange)}`;
    }
    const fieldIds = [
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
    const additionalFieldIds: string[] = [];
    for (const fieldId of this.fieldNameById.keys()) {
      // Skip fields that are already included in the fields above
      if (!fieldIds.includes(fieldId)) {
        additionalFieldIds.push(fieldId);
      }
    }
    return this.iterate(
      (startAt) =>
        this.api.v2.issueSearch.searchForIssuesUsingJql({
          jql,
          startAt,
          fields: [...fieldIds, ...additionalFieldIds],
          expand: 'changelog',
          maxResults: this.maxPageSize,
        }),
      async (item: any) => {
        const dependencies: Dependency[] = [];
        for (const link of item.fields.issuelinks ?? []) {
          const dependency = link.inwardIssue?.key;
          if (dependency) {
            dependencies.push({
              key: dependency,
              inward: link.type.inward,
              outward: link.type.outward,
            });
          }
        }

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

        const fieldsToIgnore = [
          ...POINTS_FIELD_NAMES,
          DEV_FIELD_NAME,
          EPIC_LINK_FIELD_NAME,
          SPRINT_FIELD_NAME,
        ];
        // Rewrite keys of additional fields to use names instead of ids
        const additionalFields: [string, string][] = [];
        for (const fieldId of additionalFieldIds) {
          const name = this.fieldNameById.get(fieldId);
          const value = item.fields[fieldId];
          if (name && fieldsToIgnore.includes(name)) {
            // Skip these custom fields. They're promoted to standard fields
            continue;
          } else if (name && value != null) {
            try {
              const fields = this.retrieveAdditionalFieldValue(name, value);
              for (const [fieldName, fieldValue] of Object.entries(fields)) {
                additionalFields.push([fieldName, fieldValue]);
              }
            } catch (err: any) {
              this.logger?.warn(
                `Failed to extract custom field ${name} on issue ${item.id}. Skipping.`
              );
            }
          }
        }

        const created = Utils.toDate(item.fields.created);
        const assignee =
          item.fields.assignee?.accountId || item.fields.assignee?.name;

        const changelog: any[] = item.changelog?.histories || [];
        changelog.sort((e1, e2) => {
          // Sort changes from least to most recent
          const created1 = +(Utils.toDate(e1.created) || new Date(0));
          const created2 = +(Utils.toDate(e2.created) || new Date(0));
          return created1 - created2;
        });

        const keyChangelog: [string, Date][] = [];
        for (const change of Jira.fieldChangelog(changelog, 'Key')) {
          keyChangelog.push([change.from, change.changed]);
        }

        const statusChangelog = this.statusChangelog(
          changelog,
          item.fields.status?.name,
          created
        );

        // Timestamp of most recent status change
        let statusChanged: Date | undefined;
        if (statusChangelog.length) {
          statusChanged = statusChangelog[statusChangelog.length - 1][1];
        }

        const assigneeChangelog = Jira.assigneeChangelog(
          changelog,
          assignee,
          created
        );

        const sprintInfo = this.sprintHistory(
          item.key,
          changelog,
          this.getIssueSprints(item),
          created,
          item.fields.issuetype?.name
        );

        return {
          id: item.id,
          key: item.key,
          type: item.fields.issuetype?.name,
          status: {
            category: item.fields.status?.statusCategory?.name,
            detail: item.fields.status?.name,
          },
          priority: item.fields.priority?.name,
          project: item.fields.project?.id,
          labels: item.fields.labels ?? [],
          creator: item.fields.creator?.accountId || item.fields.creator?.name,
          created,
          updated: Utils.toDate(item.fields.updated),
          statusChanged,
          statusChangelog,
          keyChangelog,
          dependencies,
          parent: item.fields.parent?.key
            ? {
                key: item.fields.parent?.key,
                type: item.fields.parent?.fields?.issuetype?.name,
              }
            : undefined,
          subtasks: item.fields.subtasks?.map((t: any) => t.key),
          summary: item.fields.summary,
          description: item.fields.description,
          assignees: assigneeChangelog,
          pullRequests,
          points: this.getPoints(item) ?? undefined,
          epic: this.getIssueEpic(item),
          sprintInfo,
          additionalFields,
          url: `${this.baseURL.replace(/\/$/, '')}/browse/${item.key}`,
          resolution: item.fields.resolution?.name,
          resolutionDate: Utils.toDate(item.fields.resolutiondate),
        };
      },
      'issues'
    );
  }

  /**
   * Attempts to retrieve a field's value from several typical locations within
   * the field's JSON blob. If the blob is an array, then each item's value will
   * be added to an array of strings which will be an entry in the returned
   * object. Also each item in the array will be exploded across the returned
   * object with the key '<name>_<index>'. If nothing can be done, then
   * the JSON blob is set to the additional field's value after being stringified.
   *
   * @param name      The name of the additional field
   * @param jsonValue The field's JSON blob to retrieve the value from
   * @return          The Record of additional fields
   */
  retrieveAdditionalFieldValue(
    name: string,
    jsonValue: any
  ): Record<string, string> {
    const additionalFields = {};

    if (isString(jsonValue)) {
      additionalFields[name] = jsonValue;
      return additionalFields;
    }

    const retrievedValue = this.retrieveFieldValue(jsonValue);
    if (retrievedValue != null) {
      additionalFields[name] = stringifyNonString(retrievedValue);
      return additionalFields;
    }

    if (Array.isArray(jsonValue)) {
      // Truncate the array to the array limit
      const inputArray = jsonValue.slice(0, this.additionalFieldsArrayLimit);

      const resultArray = inputArray.map((item, index) => {
        const val = this.retrieveFieldValue(item) ?? item;
        // Also explode each item across additional fields
        additionalFields[name + '_' + index] = stringifyNonString(val);
        return val;
      });

      additionalFields[name] = JSON.stringify(resultArray);
      return additionalFields;
    }

    // Nothing could be retrieved
    additionalFields[name] = stringifyNonString(jsonValue);
    return additionalFields;
  }

  /**
   * Check for existence of the members 'value', 'name' and then
   * 'displayName'in that order and return when one is found
   * (or undefined if none).
   *
   * @param jsonValue The object whose members should be considered
   * @returns         The value, name or displayName within the object
   */
  retrieveFieldValue(jsonValue: any): any | undefined {
    let val;
    if (jsonValue?.value != null) {
      val = jsonValue.value;
    } else if (jsonValue?.name != null) {
      val = jsonValue.name;
    } else if (jsonValue?.displayName != null) {
      val = jsonValue.displayName;
    }
    return val;
  }
}

function stringifyNonString(value: any): string {
  return isString(value) ? value : JSON.stringify(value);
}
