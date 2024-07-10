import {AirbyteLogger} from 'faros-airbyte-cdk';
import {
  AppInstallation,
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
  LabelsQuery,
  ListMembersQuery,
  PullRequestsQuery,
} from 'faros-airbyte-common/github/generated';
import {
  LABELS_QUERY,
  ORG_MEMBERS_QUERY,
  PULL_REQUESTS_QUERY,
} from 'faros-airbyte-common/github/queries';
import {isEmpty, isNil, omit, pick} from 'lodash';
import {Memoize} from 'typescript-memoize';
import VError from 'verror';

import {ExtendedOctokit, makeOctokitClient} from './octokit';
import {GitHubConfig, GraphQLErrorResponse} from './types';

export const PAGE_SIZE = 100;
export const PR_NESTED_PAGE_SIZE = 100;
const PROMISE_TIMEOUT_MS = 120_000;

export abstract class GitHub {
  private static github: GitHub;

  constructor(
    protected readonly config: GitHubConfig,
    protected readonly baseOctokit: ExtendedOctokit,
    protected readonly logger: AirbyteLogger
  ) {}

  static async instance(
    cfg: GitHubConfig,
    logger: AirbyteLogger
  ): Promise<GitHub> {
    if (GitHub.github) {
      return GitHub.github;
    }
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

  @Memoize()
  async getPullRequests(
    org: string,
    repo: string
  ): Promise<ReadonlyArray<PullRequest>> {
    const pullRequests: PullRequest[] = [];
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
        pullRequests.push({
          org,
          repo,
          ...pr,
          labels: omit(pr.labels, ['pageInfo']),
        });
      }
    }
    return pullRequests;
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
    org: string
  ): AsyncGenerator<CopilotSeatsStreamRecord> {
    let seatsFound: boolean = false;
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
          if (!seatsFound) seatsFound = true;
          yield {
            org,
            user: seat.assignee.login as string,
            ...pick(seat, [
              'created_at',
              'updated_at',
              'pending_cancellation_date',
              'last_activity_at',
            ]),
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
    const github = new GitHubToken(cfg, baseOctokit, logger);
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
    const github = new GitHubApp(cfg, baseOctokit, logger);
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
