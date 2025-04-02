import {TeamProject} from 'azure-devops-node-api/interfaces/CoreInterfaces';
import {
  GitBranchStats,
  GitCommitRef,
  GitPullRequest,
  GitPullRequestSearchCriteria,
  GitQueryCommitsCriteria,
  GitRepository,
  PullRequestAsyncStatus,
  PullRequestStatus,
} from 'azure-devops-node-api/interfaces/GitInterfaces';
import {AirbyteLogger, wrapApiError} from 'faros-airbyte-cdk';
import {
  AzureDevOps,
  AzureDevOpsClient,
  Commit,
  PullRequest,
  Repository,
  Tag,
} from 'faros-airbyte-common/azure-devops';
import {DateTime} from 'luxon';
import {Memoize} from 'typescript-memoize';
import {VError} from 'verror';

export const DEFAULT_BRANCH_PATTERN = '^main$';
export const DEFAULT_PAGE_SIZE = 100;
export const DEFAULT_REQUEST_TIMEOUT = 60000;
export const DEFAULT_MAX_RETRIES = 3;
export const DEFAULT_CUTOFF_DAYS = 90;

export class AzureRepos extends AzureDevOps {
  private readonly branchPattern: RegExp;
  private readonly fetchTags: boolean;
  private readonly fetchBranchCommits: boolean;
  private readonly repositoriesByProject: Map<string, Set<string>>;
  constructor(
    protected readonly client: AzureDevOpsClient,
    protected readonly cutoffDays: number = DEFAULT_CUTOFF_DAYS,
    protected readonly top: number = DEFAULT_PAGE_SIZE,
    protected readonly logger: AirbyteLogger,
    branchPattern: string,
    repositories?: ReadonlyArray<string>,
    fetchTags: boolean = false,
    fetchBranchCommits: boolean = false
  ) {
    super(client, cutoffDays, top, logger);
    this.branchPattern = new RegExp(branchPattern || DEFAULT_BRANCH_PATTERN);
    this.fetchTags = fetchTags;
    this.fetchBranchCommits = fetchBranchCommits;
    this.repositoriesByProject = new Map();
    for (const repository of repositories ?? []) {
      const [project, repo] = repository.split('/');
      const projectName = project.toLowerCase();
      const repoName = repo.toLowerCase();
      this.repositoriesByProject.set(
        projectName,
        (this.repositoriesByProject.get(projectName) || new Set()).add(repoName)
      );
    }
  }

  async checkConnection(projects?: ReadonlyArray<string>): Promise<void> {
    try {
      const allProjects = await this.getProjects(projects);
      if (!allProjects.length) {
        throw new VError('Failed to fetch projects');
      }
      await this.getRepositories(allProjects[0]).next();
      await this.getUsers(projects).next();
    } catch (err: any) {
      throw new VError(err, 'Please verify your access token is correct');
    }
  }

  async *getRepositories(project: TeamProject): AsyncGenerator<Repository> {
    const repos = await this.listRepositories(project.id, project.name);
    for (const repository of repos) {
      const branches = await this.listBranches(project.id, repository);
      const tags = this.fetchTags
        ? await this.listRepositoryTags(project.id, repository)
        : [];

      yield {
        ...repository,
        project,
        branches,
        tags,
      };
    }
  }

  async *getPullRequests(
    since?: string,
    projects?: ReadonlyArray<string>
  ): AsyncGenerator<PullRequest> {
    const sinceDate = since
      ? DateTime.fromISO(since)
      : DateTime.now().minus({days: this.cutoffDays});

    for (const project of await this.getProjects(projects)) {
      this.logger.info(`Fetching pull requests for project ${project.name}`);
      for (const repository of await this.listRepositories(
        project.id,
        project.name
      )) {
        if (repository.isDisabled) {
          this.logger.info(
            `Repository ${repository.name}:${repository.id} in project ` +
              `${project.name} is disabled, skipping`
          );
          continue;
        }
        for (const branch of await this.listBranches(project.id, repository)) {
          yield* this.listPullRequests(
            project.id,
            repository,
            branch,
            sinceDate
          );
        }
      }
    }
  }

  async *getCommits(
    since?: string,
    projects?: ReadonlyArray<string>
  ): AsyncGenerator<Commit> {
    const sinceDate = since
      ? DateTime.fromISO(since)
      : DateTime.now().minus({day: this.cutoffDays});

    for (const project of await this.getProjects(projects)) {
      this.logger.info(`Fetching commits for project ${project.name}`);
      for (const repository of await this.listRepositories(
        project.id,
        project.name
      )) {
        if (repository.isDisabled) {
          this.logger.info(
            `Repository ${repository.name}:${repository.id} in project ` +
              `${project.name} is disabled, skipping`
          );
          continue;
        }
        const branchNames = new Set<string>();
        const branch = getQueryableDefaultBranch(repository.defaultBranch);
        if (branch) {
          branchNames.add(branch);
        }
        if (this.fetchBranchCommits) {
          for (const branch of await this.listBranches(
            project.id,
            repository
          )) {
            branchNames.add(branch.name);
          }
        }

        if (!branchNames.size) {
          this.logger.error(
            `No default branch and/or branches matching the branch pattern ` +
              `found for repository ${repository.name}. Will not fetch any commits.`
          );
          continue;
        }

        for (const branchName of branchNames) {
          const commits = this.listCommits(
            project.id,
            repository,
            branchName,
            sinceDate
          );
          for await (const commit of commits) {
            yield {
              ...commit,
              branch,
              repository: {
                ...repository,
                project,
              },
            };
          }
        }
      }
    }
  }

  @Memoize((project: string) => project)
  private async listRepositories(
    project: string,
    projectName: string
  ): Promise<GitRepository[]> {
    const repositories = await this.client.git.getRepositories(project);
    const filterRepos = this.repositoriesByProject.get(
      projectName.toLowerCase()
    );
    if (!filterRepos?.size) {
      return repositories;
    }
    return repositories.filter((repository) =>
      filterRepos.has(repository.name.toLowerCase())
    );
  }

  /**
   * List all of the commits for a branch within a given repository and project.
   * If 'since' provided, only commits after the specified date will be returned.
   *
   * @param project The project containing the repository
   * @param repo    The repository containing the branch
   * @param branch  The branch containing the commits
   * @param since   Commits will be ignored before this date
   * @returns       An AsyncGenerator of commits
   */
  private async *listCommits(
    project: string,
    repo: GitRepository,
    branch: string,
    since: DateTime
  ): AsyncGenerator<GitCommitRef> {
    const searchCriteria: GitQueryCommitsCriteria = {
      itemVersion: {version: branch},
      fromDate: since.toISO(),
    };
    const getCommitsFn = (
      top: number,
      skip: number | string
    ): Promise<GitCommitRef[]> =>
      this.client.git.getCommits(
        repo.id,
        searchCriteria,
        project,
        skip as number,
        top
      );

    yield* this.getPaginated<GitCommitRef>(getCommitsFn);
  }

  /**
   * Lists all of the branches within a repository. If a branch pattern is provided then
   * only those that match the pattern are returned.
   *
   * @param project The project containing the repository
   * @param repo    The repository containing the branches
   * @returns       The branches
   */
  @Memoize((project: string, repo: GitRepository) => `${project};${repo.id}`)
  private async listBranches(
    project: string,
    repo: GitRepository
  ): Promise<GitBranchStats[]> {
    const branches = [];
    try {
      const branchesRes = await this.client.git.getBranches(repo.id, project);
      for (const branch of branchesRes ?? []) {
        if (!this.branchPattern.test(branch.name)) {
          this.logger.info(
            `Skipping branch ${branch.name} since it does not match ${this.branchPattern} pattern`
          );
        } else {
          branches.push(branch);
        }
      }
    } catch (err: any) {
      this.logger.error(
        `Failed to list branches for repository ${repo.name}: ${wrapApiError(err).message}`
      );
    }
    return branches;
  }

  /**
   * Lists all of a repository's tags.
   *
   * @param project The project containing the repository
   * @param repo    The repository
   * @returns       The repositories tags
   */
  private async listRepositoryTags(
    project: string,
    repo: GitRepository
  ): Promise<Tag[]> {
    const tags = [];
    try {
      const res = await this.client.git.getRefs(
        repo.id,
        project,
        /* filter */ 'tags',
        /* includeLinks */ false,
        /* includeStatuses */ false,
        /* includeMyBranches */ false,
        /* latestStatusesOnly */ false,
        /* peelTags */ true
      );
      for (const tag of res ?? []) {
        // Per docs, annotated tags will populate the peeledObjectId property
        if (tag.peeledObjectId) {
          const annotatedTag = await this.client.git.getAnnotatedTag(
            project,
            repo.id,
            tag.objectId
          );
          tags.push({...tag, commit: annotatedTag});
        }
      }
    } catch (err: any) {
      this.logger.error(
        `Failed to list tags for repository ${repo.name}: ${wrapApiError(err).message}`
      );
    }
    return tags;
  }

  /**
   * Lists 'all' of the pull requests within a given project and repository
   * whose target branch is the given branch.
   *
   * @param project         The project whose pull requests should be retrieved
   * @param repo            The repository whose pull requests should be retrieved
   * @param branch          The target branch of pull requests that should be retrieved
   * @param completedSince  The date after which 'completed' pull requests are considered
   * @returns               An AsyncGenerator of pull requests
   */
  private async *listPullRequests(
    project: string,
    repo: GitRepository,
    branch: GitBranchStats,
    since?: DateTime
  ): AsyncGenerator<PullRequest> {
    const searchCriteria: GitPullRequestSearchCriteria = {
      status: PullRequestStatus.All,
      targetRefName: `refs/heads/${branch.name}`,
    };

    const getPullRequestsFn = (
      top: number,
      skip: number | string
    ): Promise<GitPullRequest[]> =>
      this.client.git.getPullRequests(
        repo.id,
        searchCriteria,
        project,
        undefined,
        skip as number,
        top
      );

    for await (const pullRequest of this.getPaginated<GitPullRequest>(
      getPullRequestsFn
    )) {
      const closedDate = DateTime.fromJSDate(pullRequest.closedDate);
      if (
        [PullRequestStatus.Completed, PullRequestStatus.Abandoned].includes(
          pullRequest.status
        ) &&
        closedDate <= since
      ) {
        continue;
      }

      const threads = await this.client.git.getThreads(
        repo.id,
        pullRequest.pullRequestId,
        project
      );
      const status = PullRequestStatus[pullRequest.status]?.toLowerCase();
      const mergeStatus = PullRequestAsyncStatus[pullRequest.mergeStatus]?.toLowerCase();
      yield {...pullRequest, status, mergeStatus, threads};
    }
  }
}

function getQueryableDefaultBranch(
  defaultBranch?: string,
  prefixToRemove = 'refs/heads/'
): string | undefined {
  if (!defaultBranch) {
    return undefined;
  }
  if (defaultBranch.startsWith(prefixToRemove)) {
    return defaultBranch.slice(prefixToRemove.length);
  }
  return defaultBranch;
}
