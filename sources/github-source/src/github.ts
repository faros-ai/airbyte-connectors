import {AirbyteLogger} from 'faros-airbyte-cdk';
import {bucket, validateBucketingConfig} from 'faros-airbyte-common/common';
import {
  AppInstallation,
  Commit,
  CopilotSeatsStreamRecord,
  CopilotUsageSummary,
  Label,
  Organization,
  PullRequest,
  Repository,
  Team,
  TeamMembership,
  User,
} from 'faros-airbyte-common/github';
import {
  CommitsQuery,
  LabelsQuery,
  ListMembersQuery,
  PullRequestsQuery,
} from 'faros-airbyte-common/github/generated';
import {
  COMMITS_CHANGED_FILES_IF_AVAILABLE_QUERY,
  COMMITS_CHANGED_FILES_QUERY,
  COMMITS_QUERY,
  LABELS_QUERY,
  ORG_MEMBERS_QUERY,
  PULL_REQUESTS_QUERY,
} from 'faros-airbyte-common/github/queries';
import {Utils} from 'faros-js-client';
import {isEmpty, isNil, omit, pick} from 'lodash';
import {Memoize} from 'typescript-memoize';
import VError from 'verror';

import {ExtendedOctokit, makeOctokitClient} from './octokit';
import {
  AuditLogTeamAddMember,
  GitHubConfig,
  GraphQLErrorResponse,
} from './types';

export const PAGE_SIZE = 100;
export const PR_NESTED_PAGE_SIZE = 100;
const PROMISE_TIMEOUT_MS = 120_000;
export const DEFAULT_CUTOFF_DAYS = 90;

const DEFAULT_BUCKET_ID = 1;

const DEFAULT_BUCKET_TOTAL = 1;

type TeamAddMemberTimestamps = {
  [team: string]: {
    [user: string]: Date;
  };
};

export abstract class GitHub {
  private static github: GitHub;

  constructor(
    protected readonly config: GitHubConfig,
    protected readonly baseOctokit: ExtendedOctokit,
    private readonly bucketId: number,
    private readonly bucketTotal: number,
    protected readonly logger: AirbyteLogger
  ) {}

  static async instance(
    cfg: GitHubConfig,
    logger: AirbyteLogger
  ): Promise<GitHub> {
    if (GitHub.github) {
      return GitHub.github;
    }
    validateBucketingConfig(cfg.bucket_id, cfg.bucket_total);

    const github =
      cfg.authentication.type === 'token'
        ? await GitHubToken.instance(cfg, logger)
        : await GitHubApp.instance(cfg, logger);
    GitHub.github = github;
    return github;
  }

  abstract checkConnection(): Promise<void>;

  abstract octokit(org: string): ExtendedOctokit;

  abstract getOrganizationsIterator(): AsyncGenerator<string>;

  isRepoInBucket(org: string, repo: string): boolean {
    const data = `${org}/${repo}`;
    return (
      bucket('farosai/airbyte-github-source', data, this.bucketTotal) ===
      this.bucketId
    );
  }

  @Memoize()
  async getOrganizations(): Promise<ReadonlyArray<string>> {
    const orgs: string[] = [];
    for await (const org of this.getOrganizationsIterator()) {
      orgs.push(org);
    }
    return orgs;
  }

  async getOrganization(orgLogin: string): Promise<Organization> {
    const org = await this.octokit(orgLogin).orgs.get({org: orgLogin});
    return pick(org.data, [
      'login',
      'name',
      'type',
      'html_url',
      'created_at',
      'updated_at',
    ]);
  }

  @Memoize()
  async getRepositories(org: string): Promise<ReadonlyArray<Repository>> {
    const repos: Repository[] = [];
    const iter = this.octokit(org).paginate.iterator(
      this.octokit(org).repos.listForOrg,
      {
        org,
        type: 'all',
        per_page: PAGE_SIZE,
      }
    );
    for await (const res of iter) {
      for (const repo of res.data) {
        if (!this.isRepoInBucket(org, repo.name)) {
          continue;
        }
        repos.push({
          org,
          ...pick(repo, [
            'name',
            'full_name',
            'private',
            'description',
            'language',
            'size',
            'default_branch',
            'html_url',
            'topics',
            'created_at',
            'updated_at',
          ]),
        });
      }
    }
    return repos;
  }

  async *getPullRequests(
    org: string,
    repo: string,
    cutoffDate?: Date
  ): AsyncGenerator<PullRequest> {
    const iter = this.octokit(org).graphql.paginate.iterator<PullRequestsQuery>(
      PULL_REQUESTS_QUERY,
      {
        owner: org,
        repo,
        page_size: PAGE_SIZE,
        nested_page_size: PR_NESTED_PAGE_SIZE,
      }
    );
    for await (const res of this.wrapIterable(iter, this.timeout)) {
      for (const pr of res.repository.pullRequests.nodes) {
        if (cutoffDate && Utils.toDate(pr.updatedAt) <= cutoffDate) {
          break;
        }
        yield {
          org,
          repo,
          ...pr,
          labels: omit(pr.labels, ['pageInfo']),
        };
      }
    }
  }

  async *getLabels(org: string, repo: string): AsyncGenerator<Label> {
    const iter = this.octokit(org).graphql.paginate.iterator<LabelsQuery>(
      LABELS_QUERY,
      {
        owner: org,
        repo,
        page_size: PAGE_SIZE,
      }
    );
    for await (const res of this.wrapIterable(iter, this.timeout)) {
      for (const label of res.repository.labels.nodes) {
        yield {
          org,
          repo,
          name: label.name,
        };
      }
    }
  }

  async *getCommits(
    org: string,
    repo: string,
    branch: string,
    cutoffDate?: Date
  ): AsyncIterableIterator<Commit> {
    const queryParameters = {
      owner: org,
      repo,
      branch,
      page_size: PAGE_SIZE,
      since: cutoffDate?.toISOString(),
    };
    // Check if the client has changedFilesIfAvailable field available
    const hasChangedFilesIfAvailable =
      await this.hasChangedFilesIfAvailable(queryParameters);
    const query = hasChangedFilesIfAvailable
      ? COMMITS_CHANGED_FILES_IF_AVAILABLE_QUERY
      : COMMITS_CHANGED_FILES_QUERY;
    // Do a first query to check if the repository has commits history
    const historyCheckResult = await this.octokit(org).graphql<CommitsQuery>(
      query,
      {
        ...queryParameters,
        page_size: 1,
      }
    );
    if (!historyCheckResult.repository?.ref?.target?.['history']) {
      this.logger.warn(`No commit history found. Skipping ${org}/${repo}`);
      return [];
    }

    // The `changedFiles` field used in COMMITS_CHANGED_FILES_QUERY,
    // has the following warning on the latest cloud schema:
    // "We recommend using the `changedFilesIfAvailable` field instead of
    // `changedFiles`, as `changedFiles` will cause your request to return an error
    // if GitHub is unable to calculate the number of changed files"
    // https://docs.github.com/en/graphql/reference/objects#commit:~:text=information%20you%20want.-,changedFiles,-(Int)
    try {
      yield* this.queryCommits(org, repo, branch, query, queryParameters);
    } catch (err: any) {
      this.logger.warn(
        `Failed to fetch commits with changed files.
         Retrying fetching commits for repo ${repo} without changed files.`
      );
      yield* this.queryCommits(
        org,
        repo,
        branch,
        COMMITS_QUERY,
        queryParameters
      );
    }
  }

  private async *queryCommits(
    org: string,
    repo: string,
    branch: string,
    query: string,
    queryParameters: any
  ): AsyncGenerator<Commit> {
    const iter = this.octokit(org).graphql.paginate.iterator<CommitsQuery>(
      query,
      queryParameters
    );
    for await (const res of iter) {
      for (const commit of res.repository.ref.target['history'].nodes) {
        yield {
          org,
          repo,
          branch,
          ...commit,
        };
      }
    }
  }

  private async hasChangedFilesIfAvailable(
    queryParameters: any
  ): Promise<boolean> {
    try {
      await this.timeout<Commit>(
        this.octokit(queryParameters.owner).graphql(
          COMMITS_CHANGED_FILES_IF_AVAILABLE_QUERY,
          {
            ...queryParameters,
            page_size: 1,
          }
        )
      );
    } catch (err: any) {
      const errorCode = err?.errors?.[0]?.extensions?.code;
      // Check if the error was caused by querying undefined changedFilesIfAvailable field to continue execution with
      // a query that uses changedFiles (legacy field)
      if (errorCode === 'undefinedField') {
        this.logger.warn(
          `Failed to fetch commits using query with changedFilesIfAvailable.
          Retrying fetching commits for repo ${queryParameters.repo} using changedFiles.`
        );
        return false;
      }
    }
    return true;
  }

  async *getOrganizationMembers(org: string): AsyncGenerator<User> {
    const iter = this.octokit(org).graphql.paginate.iterator<ListMembersQuery>(
      ORG_MEMBERS_QUERY,
      {
        login: org,
        page_size: PAGE_SIZE,
      }
    );
    for await (const res of this.wrapIterable(
      iter,
      this.timeout,
      this.acceptPartialResponseWrapper(`org users for ${org}`)
    )) {
      for (const member of res.organization.membersWithRole.nodes) {
        if (member?.login) {
          yield {
            org,
            ...member,
          };
        }
      }
    }
  }

  @Memoize()
  async getTeams(org: string): Promise<ReadonlyArray<Team>> {
    const teams: Team[] = [];
    const iter = this.octokit(org).paginate.iterator(
      this.octokit(org).teams.list,
      {
        org,
        per_page: PAGE_SIZE,
      }
    );
    for await (const res of iter) {
      for (const team of res.data) {
        teams.push({
          org,
          parentSlug: team.parent?.slug ?? null,
          ...pick(team, ['name', 'slug', 'description']),
        });
      }
    }
    return teams;
  }

  async *getTeamMemberships(org: string): AsyncGenerator<TeamMembership> {
    for (const team of await this.getTeams(org)) {
      const iter = this.octokit(org).paginate.iterator(
        this.octokit(org).teams.listMembersInOrg,
        {
          org,
          team_slug: team.slug,
          per_page: PAGE_SIZE,
        }
      );
      for await (const res of iter) {
        for (const member of res.data) {
          if (member.login) {
            yield {
              org,
              team: team.slug,
              user: member.login,
            };
          }
        }
      }
    }
  }

  async *getCopilotSeats(
    org: string,
    cutoffDate: Date
  ): AsyncGenerator<CopilotSeatsStreamRecord> {
    let seatsFound: boolean = false;
    let teamAddMemberTimestamps: TeamAddMemberTimestamps;
    const iter = this.octokit(org).paginate.iterator(
      this.octokit(org).copilot.listCopilotSeats,
      {
        org,
        per_page: PAGE_SIZE,
      }
    );
    try {
      for await (const res of iter) {
        for (const seat of res.data.seats) {
          if (!seatsFound) {
            seatsFound = true;
          }
          if (seat.assigning_team && !teamAddMemberTimestamps) {
            // try to fetch team add member timestamps only if there are seats with team assignments
            teamAddMemberTimestamps = await this.getTeamAddMemberTimestamps(
              org,
              'copilot team assignments',
              cutoffDate
            );
          }
          const userAssignee = seat.assignee.login as string;
          const teamAssignee = seat.assigning_team?.slug ?? null;
          let createdAt = Utils.toDate(seat.created_at);
          if (teamAssignee) {
            const teamJoinedAt =
              teamAddMemberTimestamps?.[teamAssignee]?.[userAssignee];
            if (teamJoinedAt) {
              if (teamJoinedAt > createdAt) {
                createdAt = teamJoinedAt;
              }
            }
          }
          const isCreatedAtUpdated = createdAt > cutoffDate;
          yield {
            org,
            user: userAssignee,
            team: teamAssignee,
            ...(isCreatedAtUpdated && {createdAt: createdAt.toISOString()}),
            ...pick(seat, ['pending_cancellation_date', 'last_activity_at']),
          };
        }
      }
    } catch (err: any) {
      // returns 404 if copilot business is not enabled for the org or if auth doesn't have required permissions
      // https://docs.github.com/en/rest/copilot/copilot-business?apiVersion=2022-11-28#get-copilot-business-seat-information-and-settings-for-an-organization
      if (err.status === 404) {
        this.logger.warn(
          `Failed to sync GitHub Copilot seats for org ${org}. Ensure GitHub Copilot is enabled for the organization and/or the authentication token/app has the right permissions.`
        );
        return;
      }
      throw err;
    }
    if (!seatsFound) {
      yield {
        empty: true,
        org,
      };
    }
  }

  async *getCopilotUsage(org: string): AsyncGenerator<CopilotUsageSummary> {
    try {
      const res = await this.octokit(org).copilot.usageMetricsForOrg({
        org,
      });
      if (isNil(res.data) || isEmpty(res.data)) {
        this.logger.warn(`No GitHub Copilot usage found for org ${org}.`);
        return;
      }
      for (const usage of res.data) {
        yield {
          org,
          ...usage,
        };
      }
    } catch (err: any) {
      // returns 404 if the organization does not have GitHub Copilot usage metrics enabled or if auth doesn't have required permissions
      // https://docs.github.com/en/enterprise-cloud@latest/early-access/copilot/copilot-usage-api
      if (err.status === 404) {
        this.logger.warn(
          `Failed to sync GitHub Copilot usage for org ${org}. Ensure GitHub Copilot is enabled for the organization and/or the authentication token/app has the right permissions.`
        );
        return;
      }
      throw err;
    }
  }

  /**
   * API only available to enterprise organizations
   * Audit logs older than 180 days are not available
   */
  async *getAuditLogs<T>(
    org: string,
    phrase: string,
    context: string
  ): AsyncGenerator<T> {
    const iter = this.octokit(org).paginate.iterator(
      this.octokit(org).auditLogs,
      {
        org,
        phrase,
        order: 'asc',
        per_page: PAGE_SIZE,
      }
    );
    try {
      for await (const res of iter) {
        for (const log of res.data) {
          yield log as T;
        }
      }
    } catch (err: any) {
      this.logger.warn(
        `Couldn't fetch audit logs for org ${org}. API only available to Enterprise organizations. Status: ${err.status}. Context: ${context}`
      );
    }
  }

  /**
   * Returns a map of team slugs to a map of user logins
   * to the timestamp when the user was added to the team.
   */
  async getTeamAddMemberTimestamps(
    org: string,
    context: string,
    cutoffDate: Date
  ): Promise<TeamAddMemberTimestamps> {
    const cutoff = cutoffDate;
    const teams: TeamAddMemberTimestamps = {};
    const iter = this.getAuditLogs<AuditLogTeamAddMember>(
      org,
      `action:team.add_member created:>${cutoff.toISOString()}`,
      context
    );
    for await (const log of iter) {
      const team = log.team.split('/')[1];
      if (!teams[team]) {
        teams[team] = {};
      }
      if (teams[team][log.user]) {
        // don't overwrite latest record
        continue;
      }
      teams[team][log.user] = Utils.toDate(log.created_at);
    }
    return teams;
  }

  // GitHub GraphQL API may return partial data with a non 2xx status when
  // a particular record in a result list is not found (null) for some reason
  private async acceptPartialResponse<T>(
    dataType: string,
    promise: Promise<T>
  ): Promise<T> {
    try {
      return await promise;
    } catch (err: any) {
      const resp = err as GraphQLErrorResponse<T>;
      if (
        resp?.response?.data &&
        !resp?.response?.errors?.find((e) => e.type !== 'NOT_FOUND')
      ) {
        this.logger.warn(
          `Received a partial response while fetching ${dataType} - ${JSON.stringify(
            {errors: resp.response.errors}
          )}`
        );
        return resp.response.data;
      }
      throw err;
    }
  }

  private acceptPartialResponseWrapper<T>(
    dataType: string
  ): (promise: Promise<T>) => Promise<T> {
    return (promise: Promise<T>) =>
      this.acceptPartialResponse(dataType, promise);
  }

  private async timeout<T>(promise: Promise<T>): Promise<T> {
    let timeoutId: NodeJS.Timeout;
    const timeout: Promise<T> = new Promise((resolve, reject) => {
      timeoutId = setTimeout(
        () =>
          reject(new Error(`Promise timed out after ${PROMISE_TIMEOUT_MS} ms`)),
        PROMISE_TIMEOUT_MS
      );
    });

    try {
      return await Promise.race([promise, timeout]);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private wrapIterable<T>(
    iter: AsyncIterable<T>,
    ...wrappers: ((
      p: Promise<IteratorResult<T>>
    ) => Promise<IteratorResult<T>>)[]
  ): AsyncIterable<T> {
    const iterator = iter[Symbol.asyncIterator]();
    return {
      [Symbol.asyncIterator]: () => ({
        next: (): Promise<IteratorResult<T>> => {
          let p = iterator.next();
          for (const wrapper of wrappers) {
            p = wrapper(p);
          }
          return p;
        },
      }),
    };
  }
}

export class GitHubToken extends GitHub {
  static async instance(
    cfg: GitHubConfig,
    logger: AirbyteLogger
  ): Promise<GitHub> {
    const baseOctokit = makeOctokitClient(cfg, undefined, logger);
    const github = new GitHubToken(
      cfg,
      baseOctokit,
      cfg.bucket_id ?? DEFAULT_BUCKET_ID,
      cfg.bucket_total ?? DEFAULT_BUCKET_TOTAL,
      logger
    );
    await github.checkConnection();
    return github;
  }

  octokit(): ExtendedOctokit {
    return this.baseOctokit;
  }

  async checkConnection(): Promise<void> {
    await this.baseOctokit.users.getAuthenticated();
  }

  async *getOrganizationsIterator(): AsyncGenerator<string> {
    const iter = this.baseOctokit.paginate.iterator(
      this.baseOctokit.orgs.listForAuthenticatedUser,
      {
        per_page: PAGE_SIZE,
      }
    );
    for await (const res of iter) {
      for (const org of res.data) {
        yield org.login;
      }
    }
  }
}

export class GitHubApp extends GitHub {
  private readonly octokitByInstallationOrg: Map<string, ExtendedOctokit> =
    new Map();

  static async instance(
    cfg: GitHubConfig,
    logger: AirbyteLogger
  ): Promise<GitHub> {
    const baseOctokit = makeOctokitClient(cfg, undefined, logger);
    const github = new GitHubApp(
      cfg,
      baseOctokit,
      cfg.bucket_id ?? DEFAULT_BUCKET_ID,
      cfg.bucket_total ?? DEFAULT_BUCKET_TOTAL,
      logger
    );
    await github.checkConnection();
    const installations = await github.getAppInstallations();
    for (const installation of installations) {
      if (installation.target_type !== 'Organization') continue;
      if (installation.suspended_at) {
        logger.warn(
          `Skipping suspended app installation for org ${installation.account.login}`
        );
        continue;
      }
      const octokit = makeOctokitClient(cfg, installation.id, logger);
      github.octokitByInstallationOrg.set(installation.account.login, octokit);
    }
    return github;
  }

  octokit(org: string): ExtendedOctokit {
    if (!this.octokitByInstallationOrg.has(org)) {
      throw new VError(`No active app installation found for org ${org}`);
    }
    return this.octokitByInstallationOrg.get(org);
  }

  async checkConnection(): Promise<void> {
    await this.baseOctokit.apps.getAuthenticated();
  }

  async *getOrganizationsIterator(): AsyncGenerator<string> {
    for (const org of this.octokitByInstallationOrg.keys()) {
      yield org;
    }
  }

  @Memoize()
  private async getAppInstallations(): Promise<ReadonlyArray<AppInstallation>> {
    const installations: AppInstallation[] = [];
    const iter = this.baseOctokit.paginate.iterator(
      this.baseOctokit.apps.listInstallations,
      {
        per_page: PAGE_SIZE,
      }
    );
    for await (const res of iter) {
      for (const installation of res.data) {
        installations.push(installation);
      }
    }
    return installations;
  }
}
