import {AirbyteLogger} from 'faros-airbyte-cdk';
import {bucket, validateBucketingConfig} from 'faros-airbyte-common/common';
import {
  AppInstallation,
  Commit,
  ContributorStats,
  CopilotSeat,
  CopilotSeatEnded,
  CopilotSeatsEmpty,
  CopilotSeatsStreamRecord,
  CopilotUsageSummary,
  Issue,
  Label,
  Organization,
  OutsideCollaborator,
  Project,
  PullRequest,
  PullRequestComment,
  PullRequestFile,
  PullRequestLabel,
  PullRequestNode,
  PullRequestReview,
  PullRequestReviewRequest,
  Release,
  Repository,
  SamlSsoUser,
  Tag,
  TagsQueryCommitNode,
  Team,
  TeamMembership,
  User,
} from 'faros-airbyte-common/github';
import {
  CommitsQuery,
  IssuesQuery,
  LabelsQuery,
  ListMembersQuery,
  ListSamlSsoUsersQuery,
  ProjectsQuery,
  PullRequestReviewRequestsQuery,
  PullRequestReviewsQuery,
  PullRequestsCursorQuery,
  PullRequestsQuery,
  RepoTagsQuery,
} from 'faros-airbyte-common/github/generated';
import {
  COMMITS_CHANGED_FILES_IF_AVAILABLE_QUERY,
  COMMITS_CHANGED_FILES_QUERY,
  COMMITS_QUERY,
  FILES_FRAGMENT,
  ISSUES_QUERY,
  LABELS_FRAGMENT,
  LABELS_QUERY,
  LIST_SAML_SSO_USERS_QUERY,
  ORG_MEMBERS_QUERY,
  PROJECTS_QUERY,
  PULL_REQUEST_REVIEW_REQUESTS_QUERY,
  PULL_REQUEST_REVIEWS_QUERY,
  PULL_REQUESTS_CURSOR_QUERY,
  PULL_REQUESTS_QUERY,
  REPOSITORY_TAGS_QUERY,
  REVIEW_REQUESTS_FRAGMENT,
  REVIEWS_FRAGMENT,
} from 'faros-airbyte-common/github/queries';
import {Utils} from 'faros-js-client';
import {isEmpty, isNil, pick, toString} from 'lodash';
import {Memoize} from 'typescript-memoize';
import VError from 'verror';

import {ExtendedOctokit, makeOctokitClient} from './octokit';
import {RunMode} from './streams/common';
import {AuditLogTeamMember, GitHubConfig, GraphQLErrorResponse} from './types';

export const DEFAULT_API_URL = 'https://api.github.com';
export const DEFAULT_REJECT_UNAUTHORIZED = true;
export const DEFAULT_RUN_MODE = RunMode.Full;
export const DEFAULT_FETCH_TEAMS = false;
export const DEFAULT_FETCH_PR_FILES = false;
export const DEFAULT_FETCH_PR_REVIEWS = true;
export const DEFAULT_CUTOFF_DAYS = 90;
export const DEFAULT_BUCKET_ID = 1;
export const DEFAULT_BUCKET_TOTAL = 1;
export const DEFAULT_PAGE_SIZE = 100;
export const DEFAULT_PR_PAGE_SIZE = 25;
export const DEFAULT_TIMEOUT_MS = 120_000;
export const DEFAULT_CONCURRENCY = 4;
export const DEFAULT_BACKFILL = false;

type TeamMemberTimestamps = {
  [user: string]: {
    [team: string]: {
      addedAt?: Date;
      removedAt?: Date;
    };
  };
};

type CopilotAssignedTeams = {[team: string]: {created_at: string}};

export abstract class GitHub {
  private static github: GitHub;
  protected readonly fetchPullRequestFiles: boolean;
  protected readonly fetchPullRequestReviews: boolean;
  protected readonly bucketId: number;
  protected readonly bucketTotal: number;
  protected readonly pageSize: number;
  protected readonly pullRequestsPageSize: number;
  protected readonly timeoutMs: number;
  protected readonly backfill: boolean;

  constructor(
    config: GitHubConfig,
    protected readonly baseOctokit: ExtendedOctokit,
    protected readonly logger: AirbyteLogger
  ) {
    this.fetchPullRequestFiles =
      config.fetch_pull_request_files ?? DEFAULT_FETCH_PR_FILES;
    this.fetchPullRequestReviews =
      config.fetch_pull_request_reviews ?? DEFAULT_FETCH_PR_REVIEWS;
    this.bucketId = config.bucket_id ?? DEFAULT_BUCKET_ID;
    this.bucketTotal = config.bucket_total ?? DEFAULT_BUCKET_TOTAL;
    this.pageSize = config.page_size ?? DEFAULT_PAGE_SIZE;
    this.pullRequestsPageSize =
      config.pull_requests_page_size ?? DEFAULT_PR_PAGE_SIZE;
    this.timeoutMs = config.timeout ?? DEFAULT_TIMEOUT_MS;
    this.backfill = config.backfill ?? DEFAULT_BACKFILL;
  }

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
        per_page: this.pageSize,
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
            'archived',
          ]),
        });
      }
    }
    return repos;
  }

  async *getPullRequests(
    org: string,
    repo: string,
    startDate?: Date,
    endDate?: Date
  ): AsyncGenerator<PullRequest> {
    // since query doesn't support filtering by date, we fetch PRs in descending order and stop when we reach the start date
    // for backfill, we first use a simplified query to iterate until reaching the end date to obtain a start cursor
    const startCursor = await this.getPullRequestsStartCursor(
      org,
      repo,
      endDate
    );
    if (this.backfill && !startCursor) {
      return;
    }
    const query = this.buildPRQuery();
    let currentPageSize = this.pullRequestsPageSize;
    let currentCursor = startCursor;
    let hasNextPage = true;
    let querySuccess = false;
    while (hasNextPage) {
      const iter = this.octokit(
        org
      ).graphql.paginate.iterator<PullRequestsQuery>(query, {
        owner: org,
        repo,
        page_size: currentPageSize,
        nested_page_size: this.pageSize,
        currentCursor,
      });
      try {
        for await (const res of this.wrapIterable(
          iter,
          this.timeout.bind(this)
        )) {
          querySuccess = true;
          for (const pr of res.repository.pullRequests.nodes) {
            if (
              this.backfill &&
              endDate &&
              Utils.toDate(pr.updatedAt) > endDate
            ) {
              continue;
            }
            if (startDate && Utils.toDate(pr.updatedAt) < startDate) {
              return;
            }
            yield {
              org,
              repo,
              ...pr,
              labels: await this.extractPullRequestLabels(pr, org, repo),
              files: await this.extractPullRequestFiles(pr, org, repo),
              reviews: await this.extractPullRequestReviews(pr, org, repo),
              reviewRequests: await this.extractPullRequestReviewRequests(
                pr,
                org,
                repo
              ),
            };
          }
          // increase page size for the next iteration in case it was decreased previously
          currentPageSize = Math.min(
            currentPageSize * 2,
            this.pullRequestsPageSize
          );
          currentCursor = res.repository.pullRequests.pageInfo.endCursor;
          hasNextPage = res.repository.pullRequests.pageInfo.hasNextPage;
          querySuccess = false;
        }
      } catch (error: any) {
        if (querySuccess) {
          // if query succeeded, the error is not related to the query itself
          throw error;
        }
        if (currentPageSize === 1) {
          // if page size is already 1, there's nothing else to try
          this.logger.warn(
            `Failed to query PRs with page size 1 on repo ${org}/${repo}`
          );
          throw error;
        }
        // decrease page size and try again
        currentPageSize = Math.max(Math.floor(currentPageSize / 2), 1);
      }
    }
  }

  private async getPullRequestsStartCursor(
    org: string,
    repo: string,
    endDate: Date
  ): Promise<string | undefined> {
    if (!this.backfill) {
      return;
    }
    const iter = this.octokit(
      org
    ).graphql.paginate.iterator<PullRequestsCursorQuery>(
      PULL_REQUESTS_CURSOR_QUERY,
      {
        owner: org,
        repo,
        page_size: this.pageSize,
      }
    );
    for await (const res of this.wrapIterable(iter, this.timeout.bind(this))) {
      for (const pr of res.repository.pullRequests.nodes) {
        if (Utils.toDate(pr.updatedAt) < endDate) {
          return res.repository.pullRequests.pageInfo.startCursor;
        }
      }
    }
  }

  private buildPRQuery(): string {
    const appendFragment = (
      query: string,
      shouldAppend: boolean,
      fragment: string,
      placeholder: string
    ): string => {
      return shouldAppend ? query + fragment : query.replace(placeholder, '');
    };

    let query = PULL_REQUESTS_QUERY;
    query = appendFragment(query, true, LABELS_FRAGMENT, '...labels');
    query = appendFragment(
      query,
      this.fetchPullRequestFiles,
      FILES_FRAGMENT,
      '...files'
    );
    query = appendFragment(
      query,
      this.fetchPullRequestReviews,
      REVIEWS_FRAGMENT,
      '...reviews'
    );
    query = appendFragment(
      query,
      this.fetchPullRequestReviews,
      REVIEW_REQUESTS_FRAGMENT,
      '...reviewRequests'
    );

    return query;
  }

  private async extractPullRequestLabels(
    pr: PullRequestNode,
    org: string,
    repo: string
  ): Promise<PullRequestLabel[]> {
    const {hasNextPage} = pr.labels.pageInfo;
    if (!hasNextPage) {
      return pr.labels.nodes;
    }
    return this.getPullRequestLabels(
      org,
      repo,
      pr.number,
      1 // start from the first page to make sure we don't miss any
    );
  }

  private async getPullRequestLabels(
    org: string,
    repo: string,
    number: number,
    startingPage: number = 1
  ): Promise<PullRequestLabel[]> {
    const iter = this.octokit(org).paginate.iterator(
      this.octokit(org).rest.issues.listLabelsOnIssue,
      {
        owner: org,
        repo,
        issue_number: number,
        per_page: this.pageSize,
        page: startingPage,
      }
    );
    const labels: PullRequestLabel[] = [];
    for await (const res of this.wrapIterable(iter, this.timeout.bind(this))) {
      for (const label of res.data) {
        labels.push(pick(label, ['name']));
      }
    }
    return labels;
  }

  private async extractPullRequestFiles(
    pr: PullRequestNode,
    org: string,
    repo: string
  ): Promise<PullRequestFile[]> {
    if (!this.fetchPullRequestFiles) {
      return [];
    }
    const {hasNextPage} = pr.files.pageInfo;
    if (!hasNextPage) {
      return pr.files.nodes;
    }
    return this.getPullRequestFiles(
      org,
      repo,
      pr.number,
      1 // start from the first page to make sure we don't miss any
    );
  }

  private async getPullRequestFiles(
    org: string,
    repo: string,
    number: number,
    startingPage: number = 1
  ): Promise<PullRequestFile[]> {
    const iter = this.octokit(org).paginate.iterator(
      this.octokit(org).rest.pulls.listFiles,
      {
        owner: org,
        repo,
        pull_number: number,
        per_page: this.pageSize,
        page: startingPage,
      }
    );
    const files: PullRequestFile[] = [];
    for await (const res of this.wrapIterable(iter, this.timeout.bind(this))) {
      for (const file of res.data) {
        files.push({
          additions: file.additions,
          deletions: file.deletions,
          path: file.filename,
        });
      }
    }
    return files;
  }

  private async extractPullRequestReviews(
    pr: PullRequestNode,
    org: string,
    repo: string
  ): Promise<PullRequestReview[]> {
    if (!this.fetchPullRequestReviews) {
      return [];
    }
    const {hasNextPage, endCursor} = pr.reviews.pageInfo;
    if (!hasNextPage) {
      return pr.reviews.nodes;
    }
    const reviews: PullRequestReview[] = [...pr.reviews.nodes];
    const remainingReviews = await this.getPullRequestReviews(
      org,
      repo,
      pr.number,
      endCursor
    );
    return reviews.concat(remainingReviews);
  }

  private async getPullRequestReviews(
    org: string,
    repo: string,
    number: number,
    startCursor?: string
  ): Promise<PullRequestReview[]> {
    const iter = this.octokit(
      org
    ).graphql.paginate.iterator<PullRequestReviewsQuery>(
      PULL_REQUEST_REVIEWS_QUERY,
      {
        owner: org,
        repo,
        number,
        nested_page_size: this.pageSize,
        cursor: startCursor,
      }
    );
    const reviews: PullRequestReview[] = [];
    for await (const res of this.wrapIterable(iter, this.timeout.bind(this))) {
      for (const review of res.repository.pullRequest.reviews.nodes) {
        reviews.push(review);
      }
    }
    return reviews;
  }

  async *getPullRequestComments(
    org: string,
    repo: string,
    startDate?: Date,
    endDate?: Date
  ): AsyncGenerator<PullRequestComment> {
    // query supports filtering by start date (since) but not by end date
    // for backfill, we iterate in ascending order from the start date and stop when we reach the end date
    const iter = this.octokit(org).paginate.iterator(
      this.octokit(org).pulls.listReviewCommentsForRepo,
      {
        owner: org,
        repo: repo,
        since: startDate?.toISOString(),
        direction: this.backfill ? 'asc' : 'desc',
        sort: 'updated',
        per_page: this.pageSize,
      }
    );
    for await (const res of this.wrapIterable(iter, this.timeout.bind(this))) {
      for (const comment of res.data) {
        if (
          this.backfill &&
          endDate &&
          Utils.toDate(comment.updated_at) > endDate
        ) {
          return;
        }
        yield {
          repository: `${org}/${repo}`,
          user: pick(comment.user, [
            'login',
            'name',
            'email',
            'html_url',
            'type',
          ]),
          ...pick(comment, [
            'id',
            'body',
            'created_at',
            'updated_at',
            'pull_request_url',
          ]),
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
        page_size: this.pageSize,
      }
    );
    for await (const res of this.wrapIterable(iter, this.timeout.bind(this))) {
      for (const label of res.repository.labels.nodes) {
        yield {
          org,
          repo,
          name: label.name,
        };
      }
    }
  }

  async extractPullRequestReviewRequests(
    pr: PullRequestNode,
    org: string,
    repo: string
  ): Promise<PullRequestReviewRequest[]> {
    if (!this.fetchPullRequestReviews) {
      return [];
    }
    const {hasNextPage, endCursor} = pr.reviewRequests.pageInfo;
    if (!hasNextPage) {
      return pr.reviewRequests.nodes;
    }
    const reviewRequests: PullRequestReviewRequest[] = [
      ...pr.reviewRequests.nodes,
    ];
    const remainingReviewRequests = await this.getPullRequestReviewRequests(
      org,
      repo,
      pr.number,
      endCursor
    );
    return reviewRequests.concat(remainingReviewRequests);
  }

  async getPullRequestReviewRequests(
    org: string,
    repo: string,
    number: number,
    startCursor?: string
  ): Promise<PullRequestReviewRequest[]> {
    const iter = this.octokit(
      org
    ).graphql.paginate.iterator<PullRequestReviewRequestsQuery>(
      PULL_REQUEST_REVIEW_REQUESTS_QUERY,
      {
        owner: org,
        repo,
        pull_number: number,
        per_page: this.pageSize,
        cursor: startCursor,
      }
    );
    const reviewRequests: PullRequestReviewRequest[] = [];
    for await (const res of this.wrapIterable(iter, this.timeout.bind(this))) {
      for (const review of res.repository.pullRequest.reviewRequests.nodes) {
        reviewRequests.push(review);
      }
    }
    return reviewRequests;
  }

  async *getCommits(
    org: string,
    repo: string,
    branch: string,
    startDate?: Date,
    endDate?: Date
  ): AsyncGenerator<Commit> {
    // query supports filtering by start date (since) and end date (until)
    const queryParameters = {
      owner: org,
      repo,
      branch,
      page_size: this.pageSize,
      since: startDate?.toISOString(),
      ...(this.backfill && {until: endDate?.toISOString()}),
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
      return;
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
        page_size: this.pageSize,
      }
    );
    for await (const res of this.wrapIterable(
      iter,
      this.timeout.bind(this),
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
        per_page: this.pageSize,
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
          per_page: this.pageSize,
        }
      );
      for await (const res of iter) {
        for (const member of res.data) {
          if (member.login) {
            yield {
              org,
              team: team.slug,
              user: pick(member, [
                'login',
                'name',
                'email',
                'html_url',
                'type',
              ]),
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
    const assignedTeams: CopilotAssignedTeams = {};
    const assignedUsers = new Set<string>();
    let teamMemberTimestamps: TeamMemberTimestamps;
    const iter = this.octokit(org).paginate.iterator(
      this.octokit(org).copilot.listCopilotSeats,
      {
        org,
        per_page: this.pageSize,
      }
    );
    try {
      for await (const res of iter) {
        for (const seat of res.data.seats) {
          seatsFound = true;
          const userAssignee = seat.assignee.login as string;
          const teamAssignee = seat.assigning_team?.slug;
          let teamJoinedAt: Date;
          let startedAt = Utils.toDate(seat.created_at);
          assignedUsers.add(userAssignee);
          if (teamAssignee) {
            if (!assignedTeams[teamAssignee]) {
              assignedTeams[teamAssignee] = pick(seat, ['created_at']);
            }
            if (!teamMemberTimestamps) {
              // try to fetch team member timestamps only if there are seats with team assignments
              teamMemberTimestamps = await this.getTeamMemberTimestamps(
                org,
                'copilot team assignments',
                cutoffDate
              );
            }
            teamJoinedAt =
              teamMemberTimestamps?.[userAssignee]?.[teamAssignee]?.addedAt;
            if (teamJoinedAt > startedAt) {
              startedAt = teamJoinedAt;
            }
          }
          const isStartedAtUpdated = startedAt > cutoffDate;
          yield {
            org,
            user: userAssignee,
            team: teamAssignee,
            teamJoinedAt: teamJoinedAt?.toISOString(),
            ...(isStartedAtUpdated && {startedAt: startedAt.toISOString()}),
            ...pick(seat, ['pending_cancellation_date', 'last_activity_at']),
          } as CopilotSeat;
        }
      }
      if (!seatsFound) {
        yield {
          empty: true,
          org,
        } as CopilotSeatsEmpty;
      } else if (teamMemberTimestamps) {
        for (const [user, teams] of Object.entries(teamMemberTimestamps)) {
          // user doesn't currently have assigned a copilot seat
          if (!assignedUsers.has(user)) {
            const lastCopilotTeam = getLastCopilotTeamForUser(
              teams,
              assignedTeams,
              cutoffDate
            );
            if (lastCopilotTeam) {
              const lastCopilotTeamLeftAt = teams[lastCopilotTeam].removedAt;
              yield {
                org,
                user,
                team: lastCopilotTeam,
                teamLeftAt: lastCopilotTeamLeftAt.toISOString(),
                endedAt: lastCopilotTeamLeftAt.toISOString(),
              } as CopilotSeatEnded;
            }
          }
        }
      }
    } catch (err: any) {
      this.handleCopilotError(err, org, 'seats');
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
          team: null,
          ...usage,
        };
      }
      yield* this.getCopilotUsageTeams(org);
    } catch (err: any) {
      this.handleCopilotError(err, org, 'usage');
    }
  }

  async *getCopilotUsageTeams(
    org: string
  ): AsyncGenerator<CopilotUsageSummary> {
    let teams: ReadonlyArray<Team>;
    try {
      teams = await this.getTeams(org);
    } catch (err: any) {
      if (err.status >= 400 && err.status < 500) {
        this.logger.warn(
          `Failed to fetch teams for org ${org}. Ensure Teams permissions are given. Skipping pulling GitHub Copilot usage by teams.`
        );
        return;
      }
      throw err;
    }
    for (const team of teams) {
      const res = await this.octokit(org).copilot.usageMetricsForTeam({
        org,
        team_slug: team.slug,
      });
      if (isNil(res.data) || isEmpty(res.data)) {
        this.logger.warn(
          `No GitHub Copilot usage found for org ${org} - team ${team.slug}.`
        );
        continue;
      }
      for (const usage of res.data) {
        yield {
          org,
          team: team.slug,
          ...usage,
        };
      }
    }
  }

  private handleCopilotError(err: any, org: string, context: string) {
    if (err.status >= 400 && err.status < 500) {
      this.logger.warn(
        `Failed to sync GitHub Copilot ${context} for org ${org}. Ensure GitHub Copilot is enabled for the organization and/or the authentication token/app has the right permissions.`
      );
      return;
    }
    throw err;
  }

  /**
   * API only available to enterprise organizations
   * Audit logs older than 180 days are not available
   */
  async getAuditLogs<T>(
    org: string,
    phrase: string,
    context: string
  ): Promise<ReadonlyArray<T>> {
    const logs = [];
    const iter = this.octokit(org).paginate.iterator(
      this.octokit(org).auditLogs,
      {
        org,
        phrase,
        order: 'asc',
        per_page: this.pageSize,
      }
    );
    try {
      for await (const res of iter) {
        for (const log of res.data) {
          logs.push(log);
        }
      }
    } catch (err: any) {
      if (err.status >= 400 && err.status < 500) {
        this.logger.warn(
          `Couldn't fetch audit logs for org ${org}. API only available to Enterprise organizations. Status: ${err.status}. Context: ${context}`
        );
        return [];
      }
      throw err;
    }
    return logs;
  }

  /**
   * Returns a map of user logins to a map of team slugs
   * to the timestamp when the user was last added/removed to the team.
   */
  async getTeamMemberTimestamps(
    org: string,
    context: string,
    cutoffDate: Date
  ): Promise<TeamMemberTimestamps> {
    const cutoff = cutoffDate;
    const users: TeamMemberTimestamps = {};
    const logs = await this.getAuditLogs<AuditLogTeamMember>(
      org,
      `action:team.add_member action:team.remove_member created:>${cutoff.toISOString()}`,
      context
    );
    for await (const log of logs) {
      if (!users[log.user]) {
        users[log.user] = {};
      }
      const team = log.team.split('/')[1];
      if (!users[log.user][team]) {
        users[log.user][team] = {};
      }
      if (log.action === 'team.add_member') {
        users[log.user][team].addedAt = Utils.toDate(log.created_at);
      } else if (log.action === 'team.remove_member') {
        users[log.user][team].removedAt = Utils.toDate(log.created_at);
      }
    }
    return users;
  }

  async *getOutsideCollaborators(
    org: string
  ): AsyncGenerator<OutsideCollaborator> {
    const iter = this.octokit(org).paginate.iterator(
      this.octokit(org).orgs.listOutsideCollaborators,
      {
        org,
        per_page: this.pageSize,
      }
    );
    for await (const res of iter) {
      for (const collaborator of res.data) {
        yield {
          org,
          ...pick(collaborator, ['login', 'email', 'name', 'type', 'html_url']),
        };
      }
    }
  }

  async *getSamlSsoUsers(org: string): AsyncGenerator<SamlSsoUser> {
    const iter = this.octokit(
      org
    ).graphql.paginate.iterator<ListSamlSsoUsersQuery>(
      LIST_SAML_SSO_USERS_QUERY,
      {
        login: org,
        page_size: this.pageSize,
      }
    );
    for await (const res of iter) {
      const identities =
        res.organization.samlIdentityProvider?.externalIdentities?.nodes ?? [];
      for (const identity of identities) {
        if (!identity?.user?.login) {
          continue;
        }
        yield {
          org,
          ...identity,
        };
      }
    }
  }

  async *getTags(org: string, repo: string): AsyncGenerator<Tag> {
    // Tags can only be sorted on the underlying commit timestamp
    // which doesn't have to correspond to tag creation timestamp
    // so, we always pull all tags
    const iter = this.octokit(org).graphql.paginate.iterator<RepoTagsQuery>(
      REPOSITORY_TAGS_QUERY,
      {
        owner: org,
        repo,
        per_page: this.pageSize,
      }
    );
    for await (const res of iter) {
      for (const tag of res.repository.refs.nodes) {
        let commit: TagsQueryCommitNode;
        if (tag.target?.type === 'Commit') {
          commit = tag.target;
        } else if (
          tag.target?.type === 'Tag' &&
          tag.target?.target?.type === 'Commit'
        ) {
          commit = tag.target.target;
        } else {
          continue;
        }
        yield {
          repository: `${org}/${repo}`,
          name: tag.name,
          commit,
        };
      }
    }
  }

  async *getReleases(org: string, repo: string): AsyncGenerator<Release> {
    const iter = this.octokit(org).paginate.iterator(
      this.octokit(org).repos.listReleases,
      {
        owner: org,
        repo,
        per_page: this.pageSize,
      }
    );
    for await (const res of iter) {
      for (const release of res.data) {
        yield {
          repository: `${org}/${repo}`,
          html_url: release.url,
          author: pick(release.author, [
            'login',
            'name',
            'email',
            'html_url',
            'type',
          ]),
          ...pick(release, [
            'id',
            'name',
            'body',
            'draft',
            'created_at',
            'published_at',
            'tag_name',
          ]),
        };
      }
    }
  }

  async *getContributorsStats(
    org: string,
    repo: string
  ): AsyncGenerator<ContributorStats> {
    const params = {owner: org, repo};
    let res = await this.octokit(org).repos.getContributorsStats(params);

    // GitHub REST API may return a 202 status code when stats are being prepared
    // https://docs.github.com/en/rest/metrics/statistics?apiVersion=2022-11-28#best-practices-for-caching
    const delaySecs = 5;
    const maxAttempts = 3;
    let attempts = 0;

    while (res?.status === 202 && attempts < maxAttempts) {
      attempts++;
      const delay = delaySecs * attempts;
      this.logger.debug(
        `Stats are being prepared for repo ${repo} in org ${org}. Trying again in ${delay} seconds.`
      );
      await Utils.sleep(delay * 1000);
      res = await this.octokit(org).repos.getContributorsStats(params);
    }

    if (res?.status === 202) {
      this.logger.info(
        `Stats are currently unavailable for repo ${repo} in org ${org}. Will sync them next time.`
      );
      return;
    }

    const data = Array.isArray(res.data) ? res.data : [];
    for (const stats of data) {
      const user = stats?.author;
      if (!user?.login) continue;
      yield {
        org,
        repo,
        user: pick(user, ['login', 'name', 'email', 'html_url', 'type']),
        ...pick(stats, ['total', 'weeks']),
      };
    }
  }

  async *getProjects(org: string): AsyncGenerator<Project> {
    const iter = this.octokit(org).graphql.paginate.iterator<ProjectsQuery>(
      PROJECTS_QUERY,
      {
        login: org,
        page_size: this.pageSize,
      }
    );
    for await (const res of iter) {
      for (const project of res.organization.projectsV2.nodes) {
        yield {
          org,
          ...pick(project, ['id', 'name', 'body', 'created_at', 'updated_at']),
        };
      }
    }
  }

  // REST API endpoint used to get organization classic projects
  // Will be deprecated, but we still need to support it for older server versions
  // see https://github.blog/changelog/2024-05-23-sunset-notice-projects-classic/
  async *getClassicProjects(org: string): AsyncGenerator<Project> {
    const iter = this.octokit(org).paginate.iterator(
      this.octokit(org).projects.listForOrg,
      {
        org,
        state: 'all',
        per_page: this.pageSize,
      }
    );
    try {
      for await (const res of iter) {
        for (const project of res.data) {
          yield {
            org,
            id: toString(project.id),
            ...pick(project, ['name', 'body', 'created_at', 'updated_at']),
          };
        }
      }
    } catch (err: any) {
      if (err.status === 404 || err.status === 410) {
        this.logger.warn(`Classic projects API is not available/deprecated.`);
        return;
      }
      throw err;
    }
  }

  async *getIssues(
    org: string,
    repo: string,
    startDate?: Date,
    endDate?: Date
  ): AsyncGenerator<Issue> {
    const iter = this.octokit(org).graphql.paginate.iterator<IssuesQuery>(
      ISSUES_QUERY,
      {
        owner: org,
        repo,
        page_size: this.pageSize,
      }
    );
    for await (const res of iter) {
      for (const issue of res.repository.issues.nodes) {
        if (
          this.backfill &&
          endDate &&
          Utils.toDate(issue.updatedAt) > endDate
        ) {
          continue;
        }
        if (startDate && Utils.toDate(issue.updatedAt) < startDate) {
          return;
        }
        yield {
          org,
          repo,
          ...issue,
        };
      }
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
    const timeout: Promise<T> = new Promise((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error(`Promise timed out after ${this.timeoutMs} ms`)),
        this.timeoutMs
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
        per_page: this.pageSize,
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
        per_page: this.pageSize,
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

function getLastCopilotTeamForUser(
  userTeams: TeamMemberTimestamps[string],
  assignedTeams: CopilotAssignedTeams,
  cutoffDate: Date
): string {
  let lastCopilotTeamLeft: string;
  let lastCopilotTeamLeftAt: Date;
  for (const [team, timestamps] of Object.entries(userTeams)) {
    const {addedAt, removedAt} = timestamps;
    if (
      // user was removed from the team after the cutoff date
      removedAt > cutoffDate &&
      // user was removed from the team after the team was assigned copilot seats
      removedAt > Utils.toDate(assignedTeams[team]?.created_at) &&
      // user was removed from the team after the last time it was added to the same team
      removedAt > Utils.toDate(addedAt ?? 0) &&
      // user was removed from the team after having left other teams with copilot
      removedAt > (lastCopilotTeamLeftAt || 0)
    ) {
      lastCopilotTeamLeft = team;
      lastCopilotTeamLeftAt = removedAt;
    }
  }
  return lastCopilotTeamLeft;
}
