import {
  GetResponseDataTypeFromEndpointMethod,
  OctokitResponse,
} from '@octokit/types';
import {AirbyteLogger} from 'faros-airbyte-cdk';
import {bucket, validateBucketingConfig} from 'faros-airbyte-common/common';
import {
  AppInstallation,
  Artifact,
  CodeScanningAlert,
  Commit,
  CopilotSeat,
  CopilotSeatEnded,
  CopilotSeatsEmpty,
  CopilotSeatsStreamRecord,
  CopilotUsageSummary,
  CoverageReport,
  DependabotAlert,
  Enterprise,
  EnterpriseCopilotSeat,
  EnterpriseCopilotSeatsEmpty,
  EnterpriseCopilotSeatsResponse,
  EnterpriseCopilotUsageSummary,
  EnterpriseTeam,
  EnterpriseTeamMembership,
  EnterpriseTeamMembershipsResponse,
  EnterpriseTeamsResponse,
  Issue,
  IssueComment,
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
  SecretScanningAlert,
  Tag,
  TagsQueryCommitNode,
  Team,
  TeamMembership,
  User,
  Workflow,
  WorkflowJob,
  WorkflowRun,
} from 'faros-airbyte-common/github';
import {
  CommitsQuery,
  CommitsQueryVariables,
  EnterpriseQuery,
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
  COMMITS_QUERY,
  ENTERPRISE_QUERY,
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
import {EnterpriseCopilotSeatsStreamRecord} from 'faros-airbyte-common/lib/github';
import {Utils} from 'faros-js-client';
import {isEmpty, isNil, pick, toLower, toString} from 'lodash';
import {Memoize} from 'typescript-memoize';
import VError from 'verror';

import {ExtendedOctokit, makeOctokitClient} from './octokit';
import {RunMode, StreamBase} from './streams/common';
import {
  AuditLogTeamMember,
  CopilotMetricsResponse,
  CopilotUsageResponse,
  GitHubConfig,
  GraphQLErrorResponse,
} from './types';

export const DEFAULT_GITHUB_API_URL = 'https://api.github.com';
export const DEFAULT_REJECT_UNAUTHORIZED = true;
export const DEFAULT_RUN_MODE = RunMode.Full;
export const DEFAULT_FETCH_TEAMS = false;
export const DEFAULT_FETCH_PR_FILES = false;
export const DEFAULT_FETCH_PR_REVIEWS = true;
export const DEFAULT_COPILOT_LICENSES_DATES_FIX = true;
export const DEFAULT_COPILOT_METRICS_PREVIEW_API = false;
export const DEFAULT_CUTOFF_DAYS = 90;
export const DEFAULT_BUCKET_ID = 1;
export const DEFAULT_BUCKET_TOTAL = 1;
export const DEFAULT_FAROS_API_URL = 'https://prod.api.faros.ai';
export const DEFAULT_FAROS_GRAPH = 'default';
export const DEFAULT_PAGE_SIZE = 100;
export const DEFAULT_COMMIT_PAGE_SIZE = 100;
export const DEFAULT_PR_PAGE_SIZE = 25;
export const DEFAULT_TIMEOUT_MS = 120_000;
export const DEFAULT_CONCURRENCY = 4;
export const DEFAULT_BACKFILL = false;
export const DEFAULT_FETCH_PR_DIFF_COVERAGE = false;
export const DEFAULT_PR_CUTOFF_LAG_SECONDS = 0;
export const DEFAULT_FETCH_PUBLIC_ORGANIZATIONS = false;

type TeamMemberTimestamps = {
  [user: string]: {
    [team: string]: {
      addedAt?: Date;
      removedAt?: Date;
    };
  };
};

type CopilotAssignedTeams = {[team: string]: {created_at: string}};

// https://docs.github.com/en/actions/administering-github-actions/usage-limits-billing-and-administration#usage-limits
const MAX_WORKFLOW_RUN_DURATION_MS = 35 * 24 * 60 * 60 * 1000; // 35 days

export abstract class GitHub {
  private static github: GitHub;
  protected readonly fetchPullRequestFiles: boolean;
  protected readonly fetchPullRequestReviews: boolean;
  protected readonly copilotMetricsPreviewAPI: boolean;
  protected readonly copilotMetricsTeams: ReadonlyArray<string>;
  protected readonly bucketId: number;
  protected readonly bucketTotal: number;
  protected readonly pageSize: number;
  protected readonly commitsPageSize: number;
  protected readonly pullRequestsPageSize: number;
  protected readonly backfill: boolean;
  protected readonly fetchPullRequestDiffCoverage: boolean;
  protected readonly pullRequestCutoffLagSeconds: number;
  protected readonly useEnterpriseAPIs: boolean;
  protected readonly fetchPublicOrganizations: boolean;

  constructor(
    config: GitHubConfig,
    protected readonly baseOctokit: ExtendedOctokit,
    protected readonly logger: AirbyteLogger
  ) {
    this.fetchPullRequestFiles =
      config.fetch_pull_request_files ?? DEFAULT_FETCH_PR_FILES;
    this.fetchPullRequestReviews =
      config.fetch_pull_request_reviews ?? DEFAULT_FETCH_PR_REVIEWS;
    this.copilotMetricsPreviewAPI =
      config.copilot_metrics_preview_api ?? DEFAULT_COPILOT_METRICS_PREVIEW_API;
    this.copilotMetricsTeams = config.copilot_metrics_teams ?? [];
    this.bucketId = config.bucket_id ?? DEFAULT_BUCKET_ID;
    this.bucketTotal = config.bucket_total ?? DEFAULT_BUCKET_TOTAL;
    this.pageSize = config.page_size ?? DEFAULT_PAGE_SIZE;
    this.commitsPageSize = config.commits_page_size ?? DEFAULT_COMMIT_PAGE_SIZE;
    this.pullRequestsPageSize =
      config.pull_requests_page_size ?? DEFAULT_PR_PAGE_SIZE;
    this.backfill = config.backfill ?? DEFAULT_BACKFILL;
    this.fetchPullRequestDiffCoverage =
      config.fetch_pull_request_diff_coverage ?? DEFAULT_FETCH_PR_DIFF_COVERAGE;
    this.pullRequestCutoffLagSeconds =
      config.pull_request_cutoff_lag_seconds ?? DEFAULT_PR_CUTOFF_LAG_SECONDS;
    this.useEnterpriseAPIs = config.enterprises?.length > 0;
    this.fetchPublicOrganizations =
      config.fetch_public_organizations ?? DEFAULT_FETCH_PUBLIC_ORGANIZATIONS;
  }

  static async instance(
    cfg: GitHubConfig,
    logger: AirbyteLogger,
    octokit?: ExtendedOctokit
  ): Promise<GitHub> {
    if (GitHub.github) {
      return GitHub.github;
    }
    validateBucketingConfig(cfg, logger.info.bind(logger));
    const baseOctokit = octokit ?? makeOctokitClient(cfg, undefined, logger);

    const github =
      cfg.authentication.type === 'token'
        ? await GitHubToken.instance(cfg, logger, baseOctokit)
        : await GitHubApp.instance(cfg, logger, baseOctokit);

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

  @Memoize()
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
        const repository: Repository = {
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
        };
        let languagesResponse:
          | GetResponseDataTypeFromEndpointMethod<
              typeof this.baseOctokit.repos.listLanguages
            >
          | undefined;
        try {
          languagesResponse = (
            await this.octokit(org).repos.listLanguages({
              owner: org,
              repo: repo.name,
            })
          ).data;
        } catch (error: any) {
          this.logger.warn(
            `Failed to fetch languages for repository ${org}/${repo.name}: ${error.status} $`
          );
        }
        repos.push({
          ...repository,
          ...(languagesResponse && {
            languages: Object.entries(languagesResponse).map(
              ([language, bytes]) => ({language, bytes})
            ),
          }),
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
    const adjustedStartDate = startDate
      ? new Date(
          Math.max(
            startDate.getTime() - this.pullRequestCutoffLagSeconds * 1000,
            0
          )
        )
      : undefined;
    const query = this.buildPRQuery();
    let currentPageSize = this.pullRequestsPageSize;
    let currentCursor = startCursor;
    let hasNextPage = true;
    let querySuccess = false;
    while (hasNextPage) {
      try {
        const res = await this.octokit(org).graphql<PullRequestsQuery>(query, {
          owner: org,
          repo,
          page_size: currentPageSize,
          nested_page_size: this.pageSize,
          cursor: currentCursor,
        });
        querySuccess = true;
        for (const pr of res.repository.pullRequests.nodes) {
          if (
            this.backfill &&
            endDate &&
            Utils.toDate(pr.updatedAt) > endDate
          ) {
            continue;
          }
          if (
            adjustedStartDate &&
            Utils.toDate(pr.updatedAt) < adjustedStartDate
          ) {
            return;
          }
          const labels = await this.extractPullRequestLabels(pr, org, repo);
          const mergedByMergeQueue = labels.some(
            (label) => label.name === 'merged-by-mq'
          );
          let coverage = null;
          if (
            this.fetchPullRequestDiffCoverage &&
            (pr.mergeCommit || mergedByMergeQueue)
          ) {
            const lastCommitSha = pr.commits.nodes?.[0]?.commit?.oid;
            if (lastCommitSha) {
              coverage = await this.getDiffCoverage(
                org,
                repo,
                lastCommitSha,
                pr.number
              );
            }
          }
          yield {
            org,
            repo,
            ...pr,
            labels,
            files: await this.extractPullRequestFiles(pr, org, repo),
            reviews: await this.extractPullRequestReviews(pr, org, repo),
            reviewRequests: await this.extractPullRequestReviewRequests(
              pr,
              org,
              repo
            ),
            coverage,
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
      } catch (error: any) {
        if (querySuccess) {
          // if query succeeded, the error is not related to the query itself
          throw error;
        }
        if (currentPageSize === 1) {
          // if page size is already 1, there's nothing else to try
          this.logger.warn(
            `Failed to query pull requests with page size 1 on repo ${org}/${repo}`
          );
          throw error;
        }
        // decrease page size and try again
        currentPageSize = Math.max(Math.floor(currentPageSize / 2), 1);
        this.logger.debug(
          `Failed to query pull requests for repo ${org}/${repo} (cursor: ${currentCursor}). Retrying with page size ${currentPageSize}.`
        );
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
    for await (const res of iter) {
      for (const pr of res.repository.pullRequests.nodes) {
        if (Utils.toDate(pr.updatedAt) < endDate) {
          return res.repository.pullRequests.pageInfo.startCursor;
        }
      }
    }
  }

  private async getDiffCoverage(
    org: string,
    repo: string,
    commitSha: string,
    prNumber: number
  ): Promise<CoverageReport | null> {
    if (!this.fetchPullRequestDiffCoverage) {
      return null;
    }

    const iter = this.octokit(org).paginate.iterator(
      this.octokit(org).repos.listCommitStatusesForRef,
      {
        owner: org,
        repo,
        ref: commitSha,
        per_page: this.pageSize,
      }
    );

    try {
      let codeClimateResult = undefined;
      let codeCovResult = undefined;
      this.logger.debug(
        `Attempting to parse code coverage for commit ${commitSha} in ${org}/${repo} for PR #${prNumber}`
      );

      const processStatus = (status: any) => {
        const match = status.description.match(/(\d+(?:\.\d+)?)%/);

        if (match) {
          const coveragePercentage = parseFloat(match[1]);
          this.logger.debug(
            `Successfully parsed code coverage from ${status.context}`
          );
          return {
            coveragePercentage: coveragePercentage,
            createdAt: Utils.toDate(status.created_at),
            commitSha,
          };
        } else {
          this.logger.warn(
            `Failed to parse ${status.context} status description: ${status.description}`
          );
          return undefined;
        }
      };

      for await (const res of iter) {
        for (const status of res.data) {
          if (status?.context === 'codeclimate/diff-coverage') {
            codeClimateResult = processStatus(status);
          } else if (status?.context === 'codecov/patch') {
            codeCovResult = processStatus(status);
          }
        }
      }

      if (codeCovResult) {
        return codeCovResult;
      } else if (codeClimateResult) {
        return codeClimateResult;
      }
    } catch (err: any) {
      if (err?.status == 403) {
        throw new VError(err, 'unable to list commit statuses');
      }
      throw err;
    }

    return null;
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
    const {nodes, pageInfo} = pr.labels || {};
    if (nodes && pageInfo && !pageInfo.hasNextPage) {
      return nodes;
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
    for await (const res of iter) {
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
    const {nodes, pageInfo} = pr.files || {};
    if (nodes && pageInfo && !pageInfo.hasNextPage) {
      return nodes;
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
    try {
      for await (const res of iter) {
        for (const file of res.data) {
          files.push({
            additions: file.additions,
            deletions: file.deletions,
            path: file.filename,
          });
        }
      }
    } catch (err: any) {
      if (err.status === 422) {
        this.logger.warn(
          `Couldn't fetch files for PR ${org}/${repo}/${number}. Status: ${err.status}. Message: ${err.message}`
        );
        return [];
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
    const {nodes, pageInfo} = pr.reviews || {};
    if (nodes && pageInfo && !pageInfo.hasNextPage) {
      return nodes;
    }
    const reviews: PullRequestReview[] = nodes ? [...nodes] : [];
    const remainingReviews = await this.getPullRequestReviews(
      org,
      repo,
      pr.number,
      pageInfo?.endCursor
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
    for await (const res of iter) {
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
    for await (const res of iter) {
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
            'html_url',
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
    for await (const res of iter) {
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
    const {nodes, pageInfo} = pr.reviewRequests || {};
    if (nodes && pageInfo && !pageInfo.hasNextPage) {
      return nodes;
    }
    const reviewRequests: PullRequestReviewRequest[] = nodes ? [...nodes] : [];
    const remainingReviewRequests = await this.getPullRequestReviewRequests(
      org,
      repo,
      pr.number,
      pageInfo?.endCursor
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
        number,
        nested_page_size: this.pageSize,
        cursor: startCursor,
      }
    );
    const reviewRequests: PullRequestReviewRequest[] = [];
    for await (const res of iter) {
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
      since: startDate?.toISOString(),
      ...(this.backfill && {until: endDate?.toISOString()}),
    };
    const query = await this.getCommitsQuery(queryParameters);
    yield* this.queryCommits(org, repo, branch, query, queryParameters);
  }

  private async *queryCommits(
    org: string,
    repo: string,
    branch: string,
    query: string,
    queryParameters: CommitsQueryVariables
  ): AsyncGenerator<Commit> {
    let res: CommitsQuery;
    let currentQuery = query;
    let currentPageSize = this.commitsPageSize;
    let currentCursor: string = undefined;
    let hasNextPage = true;
    let querySuccess = false;
    while (hasNextPage) {
      try {
        res = await this.octokit(org).graphql<CommitsQuery>(currentQuery, {
          ...queryParameters,
          page_size: currentPageSize,
          cursor: currentCursor,
        });
        querySuccess = true;
        if (res?.repository?.ref?.target?.type !== 'Commit') {
          // check to make ts happy
          return;
        }
        const history = res.repository.ref.target.history;
        if (!history) {
          this.logger.debug(`No commit history found for ${org}/${repo}`);
          return;
        }
        for (const commit of history.nodes) {
          yield {
            org,
            repo,
            branch,
            ...commit,
          };
        }
        currentQuery = query;
        // increase page size for the next iteration in case it was decreased previously
        currentPageSize = Math.min(currentPageSize * 2, this.commitsPageSize);
        currentCursor = history.pageInfo.endCursor;
        hasNextPage = history.pageInfo.hasNextPage;
        querySuccess = false;
      } catch (error: any) {
        if (querySuccess) {
          // if query succeeded, the error is not related to the root query itself
          throw error;
        }
        if (currentPageSize === 1) {
          const errorMessages = error?.errors?.map((e: any) => e.message);
          if (!errorMessages || errorMessages.length != 1) {
            throw error;
          }
          if (/changedFiles|additions|deletions/.test(errorMessages[0])) {
            this.logger.warn(
              `Failed to query commits with diff stats for repo ${org}/${repo} (cursor: ${currentCursor}). Retrying without diff stats.`
            );
            currentQuery = removeDiffStatsFromCommitsQuery(currentQuery);
            continue;
          }
          // if page size is already 1, there's nothing else to try
          this.logger.warn(
            `Failed to query commits with page size 1 on repo ${org}/${repo}`
          );
          throw error;
        }
        // decrease page size and try again
        currentPageSize = Math.max(Math.floor(currentPageSize / 2), 1);
        this.logger.debug(
          `Failed to query commits for repo ${org}/${repo} (cursor: ${currentCursor}). Retrying with page size ${currentPageSize}.`
        );
      }
    }
  }

  // memoize since one call is enough to check if the field is available
  @Memoize(() => null)
  private async getCommitsQuery(
    queryParameters: CommitsQueryVariables
  ): Promise<string> {
    // Check if the server has changedFilesIfAvailable field available (versions < 3.8)
    // See: https://docs.github.com/en/graphql/reference/objects#commit
    const query = removeDiffStatsFromCommitsQuery(COMMITS_QUERY); // test only keeping changedFilesIfAvailable field
    try {
      await this.octokit(queryParameters.owner).graphql(query, {
        ...queryParameters,
        page_size: 1,
      });
    } catch (err: any) {
      const errorCode = err?.errors?.[0]?.extensions?.code;
      // Check if the error was caused by querying undefined changedFilesIfAvailable field
      if (errorCode === 'undefinedField') {
        this.logger.warn(
          `GQL schema Commit object doesn't contain field changedFilesIfAvailable. Will query for changedFiles instead.`
        );
        return COMMITS_QUERY.replace(/changedFilesIfAvailable\s+/, '');
      }
      throw err;
    }
    return COMMITS_QUERY.replace(/changedFiles\s+/, '');
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
              user_login: member.login,
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
    cutoffDate: Date,
    useCopilotTeamAssignmentsFix: boolean
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
          if (teamAssignee && useCopilotTeamAssignmentsFix) {
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
    this.logger.debug(
      `Found ${Object.keys(assignedTeams).length} copilot team assignments: ${Object.keys(assignedTeams).join(',')}`
    );
  }

  async *getCopilotUsage(
    org: string,
    cutoffDate: number
  ): AsyncGenerator<CopilotUsageSummary> {
    let data: CopilotUsageResponse;
    try {
      if (!this.copilotMetricsPreviewAPI) {
        const res: OctokitResponse<CopilotMetricsResponse> = await this.octokit(
          org
        ).request(this.octokit(org).copilotMetrics, {
          org,
        });
        data = transformCopilotMetricsResponse(res.data);
      } else {
        const res = await this.octokit(org).copilot.usageMetricsForOrg({
          org,
        });
        data = res.data;
      }
      if (isNil(data) || isEmpty(data)) {
        this.logger.warn(`No GitHub Copilot usage found for org ${org}.`);
        return;
      }
      const latestDay = Math.max(
        0,
        ...data.map((usage) => Utils.toDate(usage.day).getTime())
      );
      if (latestDay <= cutoffDate) {
        this.logger.info(
          `GitHub Copilot usage data for org ${org} is already up-to-date: ${new Date(cutoffDate).toISOString()}`
        );
        return;
      }
      for (const usage of data) {
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
    let teamSlugs: ReadonlyArray<string>;
    try {
      if (this.copilotMetricsTeams.length > 0) {
        teamSlugs = this.copilotMetricsTeams;
      } else {
        const teamsResponse = await this.getTeams(org);
        teamSlugs = teamsResponse.map((team) => team.slug);
      }
    } catch (err: any) {
      if (err.status >= 400 && err.status < 500) {
        this.logger.warn(
          `Failed to fetch teams for org ${org}. Ensure Teams permissions are given. Skipping pulling GitHub Copilot usage by teams.`
        );
        return;
      }
      throw err;
    }
    for (const teamSlug of teamSlugs) {
      let data: CopilotUsageResponse;
      if (!this.copilotMetricsPreviewAPI) {
        const res: OctokitResponse<CopilotMetricsResponse> = await this.octokit(
          org
        ).request(this.octokit(org).copilotMetricsForTeam, {
          org,
          team_slug: teamSlug,
        });
        data = transformCopilotMetricsResponse(res.data);
      } else {
        const res = await this.octokit(org).copilot.usageMetricsForTeam({
          org,
          team_slug: teamSlug,
        });
        data = res.data;
      }
      if (isNil(data) || isEmpty(data)) {
        this.logger.warn(
          `No GitHub Copilot usage found for org ${org} - team ${teamSlug}.`
        );
        continue;
      }
      for (const usage of data) {
        yield {
          org,
          team: teamSlug,
          ...usage,
        };
      }
    }
  }

  private handleCopilotError(err: any, org: string, context: string) {
    if (err.status >= 400 && err.status < 500) {
      if (err.message) {
        this.logger.warn(err.message);
      }
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
    let res: ListSamlSsoUsersQuery;
    let currentCursor: string = undefined;
    let hasNextPage = true;
    while (hasNextPage) {
      res = await this.octokit(org).graphql<ListSamlSsoUsersQuery>(
        LIST_SAML_SSO_USERS_QUERY,
        {
          login: org,
          page_size: this.pageSize,
          cursor: currentCursor,
        }
      );
      const identities =
        res.organization.samlIdentityProvider?.externalIdentities?.nodes ?? [];
      for (const identity of identities) {
        if (!identity?.user?.login) {
          continue;
        }
        yield {
          org,
          user_login: identity.user.login,
          ...identity,
        };
      }
      currentCursor =
        res.organization.samlIdentityProvider?.externalIdentities?.pageInfo
          ?.endCursor;
      hasNextPage =
        res.organization.samlIdentityProvider?.externalIdentities?.pageInfo
          ?.hasNextPage;
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
          commit_sha: commit.sha,
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

  async *getIssueComments(
    org: string,
    repo: string,
    startDate?: Date,
    endDate?: Date
  ): AsyncGenerator<IssueComment> {
    // query supports filtering by start date (since) but not by end date
    // for backfill, we iterate in ascending order from the start date and stop when we reach the end date
    const iter = this.octokit(org).paginate.iterator(
      this.octokit(org).issues.listCommentsForRepo,
      {
        owner: org,
        repo: repo,
        since: startDate?.toISOString(),
        direction: this.backfill ? 'asc' : 'desc',
        sort: 'updated',
        per_page: this.pageSize,
      }
    );
    for await (const res of iter) {
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
            'issue_url',
            'html_url',
          ]),
        };
      }
    }
  }

  async *getCodeScanningAlerts(
    org: string,
    repo: string,
    startDate?: Date,
    endDate?: Date
  ): AsyncGenerator<CodeScanningAlert> {
    const iter = this.octokit(org).paginate.iterator(
      this.octokit(org).codeScanning.listAlertsForRepo,
      {
        owner: org,
        repo,
        per_page: this.pageSize,
        sort: 'updated',
        direction: 'desc',
      }
    );
    try {
      for await (const res of iter) {
        for (const alert of res.data) {
          if (
            this.backfill &&
            endDate &&
            Utils.toDate(alert.updated_at) > endDate
          ) {
            continue;
          }
          if (startDate && Utils.toDate(alert.updated_at) < startDate) {
            return;
          }
          yield {
            org,
            repo,
            ...alert,
            dismissed_by: alert.dismissed_by?.login ?? null,
          };
        }
      }
    } catch (err: any) {
      this.handleSecurityAlertError(err, org, repo, 'code scanning');
    }
  }

  async *getDependabotAlerts(
    org: string,
    repo: string,
    startDate?: Date,
    endDate?: Date
  ): AsyncGenerator<DependabotAlert> {
    const iter = this.octokit(org).paginate.iterator(
      this.octokit(org).dependabot.listAlertsForRepo,
      {
        owner: org,
        repo,
        per_page: this.pageSize,
        sort: 'updated',
        direction: 'desc',
      }
    );
    try {
      for await (const res of iter) {
        for (const alert of res.data) {
          if (
            this.backfill &&
            endDate &&
            Utils.toDate(alert.updated_at) > endDate
          ) {
            continue;
          }
          if (startDate && Utils.toDate(alert.updated_at) < startDate) {
            return;
          }
          yield {
            org,
            repo,
            ...alert,
            dismissed_by: alert.dismissed_by?.login ?? null,
          };
        }
      }
    } catch (err: any) {
      this.handleSecurityAlertError(err, org, repo, 'dependabot');
    }
  }

  async *getSecretScanningAlerts(
    org: string,
    repo: string,
    startDate?: Date,
    endDate?: Date
  ): AsyncGenerator<SecretScanningAlert> {
    const iter = this.octokit(org).paginate.iterator(
      this.octokit(org).secretScanning.listAlertsForRepo,
      {
        owner: org,
        repo,
        per_page: this.pageSize,
        sort: 'updated',
        direction: 'desc',
      }
    );
    try {
      for await (const res of iter) {
        for (const alert of res.data) {
          if (
            this.backfill &&
            endDate &&
            Utils.toDate(alert.updated_at) > endDate
          ) {
            continue;
          }
          if (startDate && Utils.toDate(alert.updated_at) < startDate) {
            return;
          }
          yield {
            org,
            repo,
            ...alert,
            resolved_by: alert.resolved_by?.login ?? null,
            push_protection_bypassed_by:
              alert.push_protection_bypassed_by?.login ?? null,
          };
        }
      }
    } catch (err: any) {
      this.handleSecurityAlertError(err, org, repo, 'secret scanning');
    }
  }

  private handleSecurityAlertError(
    err: any,
    org: string,
    repo: string,
    context: string
  ) {
    if (err.status >= 400 && err.status < 500) {
      this.logger.debug(
        `Couldn't fetch ${context} alerts for repo ${org}/${repo}. Status: ${err.status}. Message: ${err.message}`
      );
      return;
    }
    throw err;
  }

  async *getWorkflows(org: string, repo: string): AsyncGenerator<Workflow> {
    const iter = this.octokit(org).paginate.iterator(
      this.octokit(org).actions.listRepoWorkflows,
      {
        owner: org,
        repo,
        per_page: this.pageSize,
      }
    );
    for await (const res of iter) {
      for (const workflow of res.data) {
        yield {
          org,
          repo,
          ...workflow,
        };
      }
    }
  }

  @Memoize((org: string, repo: string) => StreamBase.orgRepoKey(org, repo))
  async getWorkflowRuns(
    org: string,
    repo: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<ReadonlyArray<WorkflowRun>> {
    const workflowRuns: WorkflowRun[] = [];
    // workflow runs have a maximum duration to be updated, and we can just filter by created_at
    const createdSince = startDate
      ? Utils.toDate(startDate.getTime() - MAX_WORKFLOW_RUN_DURATION_MS)
      : null;
    const iter = this.octokit(org).paginate.iterator(
      this.octokit(org).actions.listWorkflowRunsForRepo,
      {
        owner: org,
        repo,
        per_page: this.pageSize,
        created: `${createdSince?.toISOString() || '*'}..${(this.backfill && endDate?.toISOString()) || '*'}`,
      }
    );
    for await (const res of iter) {
      for (const workflowRun of res.data) {
        // skip runs that were updated before the start date / updated_at cutoff
        if (Utils.toDate(workflowRun.updated_at) < startDate) {
          continue;
        }
        workflowRuns.push({
          org,
          repo,
          ...pick(workflowRun, [
            'id',
            'name',
            'head_branch',
            'head_sha',
            'path',
            'run_number',
            'event',
            'display_title',
            'status',
            'conclusion',
            'workflow_id',
            'url',
            'html_url',
            'created_at',
            'updated_at',
            'run_attempt',
            'run_started_at',
          ]),
        });
      }
    }
    return workflowRuns;
  }

  async *getWorkflowRunJobs(
    org: string,
    repo: string,
    workflowRun: WorkflowRun
  ): AsyncGenerator<WorkflowJob> {
    const iter = this.octokit(org).paginate.iterator(
      this.octokit(org).actions.listJobsForWorkflowRun,
      {
        owner: org,
        repo,
        run_id: workflowRun.id,
        per_page: this.pageSize,
      }
    );
    for await (const res of iter) {
      for (const job of res.data) {
        yield {
          org,
          repo,
          workflow_id: workflowRun.workflow_id, // workflow_id is not available in job object
          ...pick(job, [
            'run_id',
            'id',
            'workflow_name',
            'head_branch',
            'run_attempt',
            'head_sha',
            'url',
            'html_url',
            'status',
            'conclusion',
            'created_at',
            'started_at',
            'completed_at',
            'name',
            'labels',
          ]),
        };
      }
    }
  }

  async *getWorkflowRunArtifacts(
    org: string,
    repo: string,
    workflowRun: WorkflowRun
  ): AsyncGenerator<Artifact> {
    const iter = this.octokit(org).paginate.iterator(
      this.octokit(org).actions.listWorkflowRunArtifacts,
      {
        owner: org,
        repo,
        run_id: workflowRun.id,
        per_page: this.pageSize,
      }
    );
    for await (const res of iter) {
      for (const artifact of res.data) {
        yield {
          org,
          repo,
          workflow_id: workflowRun.workflow_id, // workflow_id is not available in artifact object
          run_id: workflowRun.id,
          ...pick(artifact, [
            'id',
            'name',
            'size_in_bytes',
            'url',
            'archive_download_url',
            'expired',
            'created_at',
            'expires_at',
            'updated_at',
          ]),
        };
      }
    }
  }

  async getEnterprise(enterprise: string): Promise<Enterprise> {
    const res = await this.baseOctokit.graphql<EnterpriseQuery>(
      ENTERPRISE_QUERY,
      {slug: enterprise}
    );
    return res.enterprise;
  }

  @Memoize()
  async getEnterpriseTeams(
    enterprise: string
  ): Promise<ReadonlyArray<EnterpriseTeam>> {
    const teams: EnterpriseTeam[] = [];
    const iter = this.baseOctokit.paginate.iterator<EnterpriseTeamsResponse[0]>(
      this.baseOctokit.enterpriseTeams,
      {
        enterprise,
        per_page: this.pageSize,
      }
    );
    for await (const res of iter) {
      for (const team of res.data) {
        teams.push({
          enterprise,
          ...pick(team, ['slug', 'name']),
        });
      }
    }
    return teams;
  }

  async *getEnterpriseTeamMemberships(
    enterprise: string
  ): AsyncGenerator<EnterpriseTeamMembership> {
    for (const team of await this.getEnterpriseTeams(enterprise)) {
      const iter = this.baseOctokit.paginate.iterator<
        EnterpriseTeamMembershipsResponse[0]
      >(this.baseOctokit.enterpriseTeamMembers, {
        enterprise,
        team_slug: team.slug,
        per_page: this.pageSize,
      });
      for await (const res of iter) {
        for (const member of res.data) {
          if (member.login) {
            yield {
              enterprise,
              team: team.slug,
              user_login: member.login,
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

  async *getEnterpriseCopilotSeats(
    enterprise: string
  ): AsyncGenerator<EnterpriseCopilotSeatsStreamRecord> {
    let seatsFound: boolean = false;
    const iter: AsyncIterableIterator<{data: EnterpriseCopilotSeatsResponse}> =
      this.baseOctokit.paginate.iterator<any>(
        this.baseOctokit.enterpriseCopilotSeats,
        {
          enterprise,
          per_page: this.pageSize,
        }
      );
    for await (const res of iter) {
      for (const seat of res.data.seats) {
        seatsFound = true;
        yield {
          enterprise,
          user: seat.assignee.login as string,
          ...pick(seat, [
            'created_at',
            'updated_at',
            'pending_cancellation_date',
            'last_activity_at',
          ]),
        } as EnterpriseCopilotSeat;
      }
    }
    if (!seatsFound) {
      yield {
        empty: true,
        enterprise,
      } as EnterpriseCopilotSeatsEmpty;
    }
  }

  async *getEnterpriseCopilotUsage(
    enterprise: string,
    cutoffDate: number
  ): AsyncGenerator<EnterpriseCopilotUsageSummary> {
    const res: OctokitResponse<CopilotMetricsResponse> =
      await this.baseOctokit.request(
        this.baseOctokit.enterpriseCopilotMetrics,
        {
          enterprise,
        }
      );
    const data = transformCopilotMetricsResponse(res.data);
    if (isNil(data) || isEmpty(data)) {
      this.logger.warn(
        `No GitHub Copilot usage found for enterprise ${enterprise}.`
      );
      return;
    }
    const latestDay = Math.max(
      0,
      ...data.map((usage) => Utils.toDate(usage.day).getTime())
    );
    if (latestDay <= cutoffDate) {
      this.logger.info(
        `GitHub Copilot usage data for enterprise ${enterprise} is already up-to-date: ${new Date(cutoffDate).toISOString()}`
      );
      return;
    }
    for (const usage of data) {
      yield {
        enterprise,
        team: null,
        ...usage,
      };
    }
    yield* this.getEnterpriseCopilotUsageTeams(enterprise);
  }

  async *getEnterpriseCopilotUsageTeams(
    enterprise: string
  ): AsyncGenerator<EnterpriseCopilotUsageSummary> {
    let teamSlugs: ReadonlyArray<string>;
    try {
      if (this.copilotMetricsTeams.length > 0) {
        teamSlugs = this.copilotMetricsTeams;
      } else {
        const teamsResponse = await this.getEnterpriseTeams(enterprise);
        teamSlugs = teamsResponse.map((team) => team.slug);
      }
    } catch (err: any) {
      if (err.status >= 400 && err.status < 500) {
        this.logger.warn(
          `Failed to fetch teams for enterprise ${enterprise}. Ensure Teams permissions are given. Skipping pulling GitHub Copilot usage by teams.`
        );
        return;
      }
      throw err;
    }
    for (const teamSlug of teamSlugs) {
      const res: OctokitResponse<CopilotMetricsResponse> =
        await this.baseOctokit.request(
          this.baseOctokit.enterpriseCopilotMetricsForTeam,
          {
            enterprise,
            team_slug: teamSlug,
          }
        );
      const data = transformCopilotMetricsResponse(res.data);
      if (isNil(data) || isEmpty(data)) {
        this.logger.warn(
          `No GitHub Copilot usage found for enterprise ${enterprise} - team ${teamSlug}.`
        );
        continue;
      }
      for (const usage of data) {
        yield {
          enterprise,
          team: teamSlug,
          ...usage,
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
    logger: AirbyteLogger,
    baseOctokit: ExtendedOctokit
  ): Promise<GitHub> {
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

    let empty = true;
    for await (const res of iter) {
      for (const org of res.data) {
        empty = false;
        yield org.login;
      }
    }

    if (this.fetchPublicOrganizations) {
      for await (const org of this.getPublicOrganizations()) {
        empty = false;
        yield org;
      }
    }

    if (!empty) {
      return;
    }

    // Fine-grained tokens return an empty list for visible orgs,
    // so if we get to this point, we're possibly using a fine-grained token.
    yield* this.getOrganizationsByRepositories();
  }

  private async *getPublicOrganizations(): AsyncGenerator<string> {
    this.logger.info(
      `Fetching public organizations enabled. ` +
        `This may result in a large number of requests.`
    );
    const orgList = this.baseOctokit.paginate.iterator(
      this.baseOctokit.orgs.list,
      {
        per_page: this.pageSize,
      }
    );
    for await (const res of orgList) {
      for (const org of res.data) {
        yield org.login;
      }
    }
  }

  /*
   * In order to determine which orgs are visible, check visible repos and track their orgs
   */
  private async *getOrganizationsByRepositories(): AsyncGenerator<string> {
    const seenOrgs = new Set<string>();
    const reposIter = this.baseOctokit.paginate.iterator(
      this.baseOctokit.repos.listForAuthenticatedUser,
      {
        per_page: this.pageSize,
        affiliation: 'organization_member',
      }
    );
    for await (const res of reposIter) {
      for (const repo of res.data) {
        if (repo.owner?.type === 'Organization') {
          if (!seenOrgs.has(repo.owner.login)) {
            seenOrgs.add(repo.owner.login);
            yield repo.owner.login;
          }
        }
      }
    }
  }
}

export class GitHubApp extends GitHub {
  private readonly octokitByInstallationOrg: Map<string, ExtendedOctokit> =
    new Map();

  static async instance(
    cfg: GitHubConfig,
    logger: AirbyteLogger,
    baseOctokit: ExtendedOctokit
  ): Promise<GitHub> {
    const github = new GitHubApp(cfg, baseOctokit, logger);
    await github.checkConnection();
    const installations = await github.getAppInstallations();
    for (const installation of installations) {
      if (installation.target_type !== 'Organization') continue;
      const orgLogin = toLower(installation.account.login);
      if (installation.suspended_at) {
        logger.warn(`Skipping suspended app installation for org ${orgLogin}`);
        continue;
      }
      const octokit = makeOctokitClient(cfg, installation.id, logger);
      github.octokitByInstallationOrg.set(orgLogin, octokit);
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
    if (this.useEnterpriseAPIs) {
      throw new VError(
        'Enterprise data is only available when authenticating with personal access token'
      );
    }
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

function transformCopilotMetricsResponse(
  data: CopilotMetricsResponse
): CopilotUsageResponse {
  return data.map((d) => {
    const breakdown =
      d.copilot_ide_code_completions?.editors?.flatMap((e) => {
        const languages: {
          [language: string]: {
            suggestions_count: number;
            acceptances_count: number;
            lines_suggested: number;
            lines_accepted: number;
            active_users: number;
          };
        } = {};
        for (const m of e.models) {
          for (const l of m.languages) {
            const language = (languages[l.name] = languages[l.name] ?? {
              suggestions_count: 0,
              acceptances_count: 0,
              lines_suggested: 0,
              lines_accepted: 0,
              active_users: 0,
            });
            language.suggestions_count += l.total_code_suggestions;
            language.acceptances_count += l.total_code_acceptances;
            language.lines_suggested += l.total_code_lines_suggested;
            language.lines_accepted += l.total_code_lines_accepted;
            language.active_users += l.total_engaged_users;
          }
        }
        return Object.entries(languages).map(([k, v]) => ({
          ...v,
          language: k,
          editor: e.name,
        }));
      }) ?? [];
    let total_chats = 0,
      total_chat_insertion_events = 0,
      total_chat_copy_events = 0;
    for (const e of d.copilot_ide_chat?.editors ?? []) {
      for (const m of e.models) {
        total_chats += m.total_chats;
        total_chat_insertion_events += m.total_chat_insertion_events;
        total_chat_copy_events += m.total_chat_copy_events;
      }
    }
    return {
      day: d.date,
      total_suggestions_count: breakdown.reduce(
        (acc, c) => acc + c.suggestions_count,
        0
      ),
      total_acceptances_count: breakdown.reduce(
        (acc, c) => acc + c.acceptances_count,
        0
      ),
      total_lines_suggested: breakdown.reduce(
        (acc, c) => acc + c.lines_suggested,
        0
      ),
      total_lines_accepted: breakdown.reduce(
        (acc, c) => acc + c.lines_accepted,
        0
      ),
      total_active_users: d.total_active_users,
      total_chats,
      total_chat_insertion_events,
      total_chat_copy_events,
      total_active_chat_users: d.copilot_ide_chat?.total_engaged_users ?? 0,
      breakdown,
    };
  });
}

function removeDiffStatsFromCommitsQuery(query: string): string {
  return query
    .replace(/changedFiles\s+/, '')
    .replace(/additions\s+/, '')
    .replace(/deletions\s+/, '');
}
