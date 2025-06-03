import {AirbyteLogger} from 'faros-airbyte-cdk';
import {FarosClient} from 'faros-js-client';
import {toLower} from 'lodash';
import {Memoize} from 'typescript-memoize';
import VError from 'verror';

import {collectReposByOrg, getFarosOptions} from './index';

/**
 * Configuration for VCS entity filtering
 */
export interface VCSFilterConfig<TConfig, TOrg, TRepo> {
  /** Configuration object containing entity filter arrays */
  config: TConfig;
  /** Logger instance for debug/warning messages */
  logger: AirbyteLogger;
  /** Optional Faros client for graph-based filtering */
  farosClient?: FarosClient;
  /** Configuration field names mapping */
  configFields: VCSConfigFields;
  /** Entity type names for logging and API calls */
  entityNames: VCSEntityNames;
  /** VCS-specific adapter for API operations */
  vcsAdapter: VCSAdapter<TOrg, TRepo>;
  /** Graph name for Faros integration (optional) */
  defaultGraph?: string;
  /** Whether to use Faros graph for repo selection */
  useFarosGraphReposSelection?: boolean;
}

/**
 * Maps configuration field names to their corresponding arrays
 */
export interface VCSConfigFields {
  /** Field name for organization/group/workspace entities (e.g., 'organizations', 'groups', 'workspaces') */
  orgs: string;
  /** Field name for excluded organization/group/workspace entities */
  excludedOrgs: string;
  /** Field name for repository entities */
  repos: string;
  /** Field name for excluded repository entities */
  excludedRepos: string;
  /** Field name for Faros graph repos selection flag */
  useFarosGraphReposSelection?: string;
  /** Field name for Faros graph name */
  graph?: string;
}

/**
 * Entity names for logging and display purposes
 */
export interface VCSEntityNames {
  /** Singular name of organization-level entity (e.g., 'organization', 'group', 'workspace') */
  org: string;
  /** Plural name of organization-level entity */
  orgs: string;
  /** Singular name of repository entity */
  repo: string;
  /** Plural name of repository entities */
  repos: string;
  /** VCS platform name (e.g., 'GitHub', 'GitLab', 'Bitbucket') */
  platform: string;
}

/**
 * VCS-specific adapter interface for API operations
 */
export interface VCSAdapter<TOrg, TRepo> {
  /** Get all visible organization-level entities */
  getOrgs(): Promise<string[]>;
  /** Get a specific organization-level entity by name */
  getOrg(orgName: string): Promise<TOrg>;
  /** Get all repositories for an organization */
  getRepos(orgName: string): Promise<TRepo[]>;
  /** Extract repository name from repository object */
  getRepoName(repo: TRepo): string;
}

/**
 * Repository inclusion result
 */
export type RepoInclusion<TRepo> = {
  repo: TRepo;
  syncRepoData: boolean;
};

/**
 * Internal filter configuration
 */
type FilterConfig = {
  orgs?: Set<string>;
  excludedOrgs?: Set<string>;
  reposByOrg?: Map<string, Set<string>>;
  excludedReposByOrg?: Map<string, Set<string>>;
};

/**
 * Generic VCS organization/repository filter
 *
 * This class provides a reusable filtering mechanism for VCS sources that follow
 * a two-level hierarchy (organization/group/workspace → repository). It supports:
 *
 * - Include/exclude patterns for both levels
 * - Case-insensitive filtering
 * - Faros Graph integration for dynamic repository selection
 * - Configurable entity names and field mappings
 * - Comprehensive validation and error handling
 *
 * @example
 * ```typescript
 * // GitHub usage
 * const filter = new VCSFilter({
 *   config: githubConfig,
 *   logger: logger,
 *   farosClient: farosClient,
 *   configFields: {
 *     orgs: 'organizations',
 *     excludedOrgs: 'excluded_organizations',
 *     repos: 'repositories',
 *     excludedRepos: 'excluded_repositories',
 *     useFarosGraphReposSelection: 'use_faros_graph_repos_selection',
 *     graph: 'graph'
 *   },
 *   entityNames: {
 *     org: 'organization',
 *     orgs: 'organizations',
 *     repo: 'repository',
 *     repos: 'repositories',
 *     platform: 'GitHub'
 *   },
 *   vcsAdapter: new GitHubAdapter(githubClient),
 *   defaultGraph: 'default-graph'
 * });
 *
 * // GitLab usage
 * const filter = new VCSFilter({
 *   config: gitlabConfig,
 *   logger: logger,
 *   configFields: {
 *     orgs: 'groups',
 *     excludedOrgs: 'excluded_groups',
 *     repos: 'repositories',
 *     excludedRepos: 'excluded_repositories'
 *   },
 *   entityNames: {
 *     org: 'group',
 *     orgs: 'groups',
 *     repo: 'repository',
 *     repos: 'repositories',
 *     platform: 'GitLab'
 *   },
 *   vcsAdapter: new GitLabAdapter(gitlabClient)
 * });
 * ```
 */
export class VCSFilter<TConfig extends Record<string, any>, TOrg, TRepo> {
  private readonly filterConfig: FilterConfig;
  private readonly useFarosGraphReposSelection: boolean;
  private orgs?: Set<string>;
  private reposByOrg: Map<string, Map<string, RepoInclusion<TRepo>>> =
    new Map();
  private loadedSelectedRepos: boolean = false;

  constructor(private readonly options: VCSFilterConfig<TConfig, TOrg, TRepo>) {
    const {config, logger, configFields, entityNames} = options;

    this.useFarosGraphReposSelection =
      config[
        configFields.useFarosGraphReposSelection ||
          'use_faros_graph_repos_selection'
      ] ?? false;

    const orgs = config[configFields.orgs] as string[] | undefined;
    const repos = config[configFields.repos] as string[] | undefined;
    const excludedRepos = config[configFields.excludedRepos] as
      | string[]
      | undefined;
    let excludedOrgs = config[configFields.excludedOrgs] as
      | string[]
      | undefined;

    if (orgs?.length && excludedOrgs?.length) {
      logger.warn(
        `Both ${configFields.orgs} and ${configFields.excludedOrgs} are specified, ${configFields.excludedOrgs} will be ignored.`
      );
      excludedOrgs = undefined;
    }

    let reposByOrg: Map<string, Set<string>>;
    let excludedReposByOrg: Map<string, Set<string>>;
    if (!this.useFarosGraphReposSelection) {
      ({reposByOrg, excludedReposByOrg} = this.getSelectedReposByOrg(
        repos,
        excludedRepos
      ));
      this.loadedSelectedRepos = true;
    } else {
      if (!this.hasFarosClient()) {
        throw new VError(
          `Faros credentials are required when using Faros Graph for ${entityNames.repos} selection`
        );
      }
      if (repos?.length || excludedRepos?.length) {
        logger.warn(
          `Using Faros Graph for ${entityNames.repos} selection but ${configFields.repos} and/or ${configFields.excludedRepos} are specified, both will be ignored.`
        );
      }
    }

    this.filterConfig = {
      orgs: orgs?.length ? new Set(orgs) : undefined,
      excludedOrgs: excludedOrgs?.length ? new Set(excludedOrgs) : undefined,
      reposByOrg,
      excludedReposByOrg,
    };
  }

  /**
   * Get all filtered organization names
   */
  @Memoize()
  async getOrgs(): Promise<ReadonlyArray<string>> {
    if (!this.orgs) {
      const {vcsAdapter, logger, entityNames} = this.options;
      const visibleOrgs = new Set(
        (await vcsAdapter.getOrgs()).map((o) => toLower(o))
      );

      if (!visibleOrgs.size) {
        logger.warn(`No visible ${entityNames.orgs} found`);
      }

      this.orgs = await this.filterOrgs(visibleOrgs);
    }

    if (this.orgs.size === 0) {
      throw new VError(
        {
          info: {
            code: 'NO_VISIBLE_ORGS',
          },
        },
        `No visible ${this.options.entityNames.orgs} remain after applying inclusion and exclusion filters`
      );
    }

    return Array.from(this.orgs);
  }

  /**
   * Get all filtered repositories for an organization
   */
  @Memoize()
  async getRepos(org: string): Promise<ReadonlyArray<RepoInclusion<TRepo>>> {
    const lowerOrg = toLower(org);

    await this.loadSelectedRepos();

    if (!this.reposByOrg.has(lowerOrg)) {
      const repos = new Map<string, RepoInclusion<TRepo>>();
      const {vcsAdapter, logger, entityNames} = this.options;
      const visibleRepos = await vcsAdapter.getRepos(lowerOrg);

      if (!visibleRepos.length) {
        logger.warn(
          `No visible ${entityNames.repos} found for ${entityNames.org} ${lowerOrg}`
        );
      }

      for (const repo of visibleRepos) {
        const lowerRepoName = toLower(vcsAdapter.getRepoName(repo));
        const {included, syncRepoData} = await this.getRepoInclusion(
          lowerOrg,
          lowerRepoName
        );
        if (included) {
          repos.set(lowerRepoName, {repo, syncRepoData});
        }
      }
      this.reposByOrg.set(lowerOrg, repos);
    }
    return Array.from(this.reposByOrg.get(lowerOrg).values());
  }

  /**
   * Check if a specific repository should be included and synced
   */
  async getRepoInclusion(
    org: string,
    repo: string
  ): Promise<{
    included: boolean;
    syncRepoData: boolean;
  }> {
    await this.loadSelectedRepos();
    const {reposByOrg, excludedReposByOrg} = this.filterConfig;
    const repos = reposByOrg?.get(org);
    const excludedRepos = excludedReposByOrg?.get(org);

    if (this.useFarosGraphReposSelection) {
      const included = true;
      const syncRepoData =
        (!repos?.size || repos.has(repo)) && !excludedRepos?.has(repo);
      return {included, syncRepoData};
    }

    if (repos?.size) {
      const included = repos.has(repo);
      return {included, syncRepoData: included};
    }

    if (excludedRepos?.size) {
      const included = !excludedRepos.has(repo);
      return {included, syncRepoData: included};
    }
    return {included: true, syncRepoData: true};
  }

  /**
   * Get a specific repository object by org and name
   */
  getRepository(org: string, name: string): TRepo {
    const lowerOrg = toLower(org);
    const lowerRepoName = toLower(name);
    const {repo} = this.reposByOrg.get(lowerOrg)?.get(lowerRepoName) ?? {};
    if (!repo) {
      throw new VError(
        `${this.options.entityNames.repo} not found: %s/%s`,
        lowerOrg,
        lowerRepoName
      );
    }
    return repo;
  }

  private async filterOrgs(visibleOrgs: Set<string>): Promise<Set<string>> {
    const orgs = new Set<string>();
    const {vcsAdapter, logger, entityNames} = this.options;

    if (!this.filterConfig.orgs) {
      for (const org of visibleOrgs) {
        const lowerOrg = toLower(org);
        if (!this.filterConfig.excludedOrgs?.has(lowerOrg)) {
          orgs.add(lowerOrg);
        } else {
          logger.info(`Skipping excluded ${entityNames.org} ${lowerOrg}`);
        }
      }
    } else {
      for (const org of this.filterConfig.orgs) {
        const lowerOrg = toLower(org);
        if (await this.isVisibleOrg(visibleOrgs, lowerOrg)) {
          orgs.add(lowerOrg);
        }
      }
    }

    return orgs;
  }

  private async isVisibleOrg(
    visibleOrgs: Set<string>,
    lowerOrg: string
  ): Promise<boolean> {
    if (visibleOrgs.has(lowerOrg)) {
      return true;
    }

    const {vcsAdapter, logger, entityNames} = this.options;

    try {
      await vcsAdapter.getOrg(lowerOrg);
      return true;
    } catch (error: any) {
      logger.warn(
        `Fetching ${entityNames.org} ${lowerOrg} failed with error: ` +
          `${error.status} - ${error.message}. Skipping.`
      );
      return false;
    }
  }

  private async loadSelectedRepos(): Promise<void> {
    if (this.loadedSelectedRepos) {
      return;
    }

    if (this.useFarosGraphReposSelection) {
      const {farosClient, config, configFields, entityNames, defaultGraph} =
        this.options;
      const graphName = config[configFields.graph || 'graph'] ?? defaultGraph;

      const farosOptions = await getFarosOptions(
        'repository',
        entityNames.platform,
        farosClient,
        graphName
      );

      const {included: repositories, excluded: excludedRepositories} =
        farosOptions;
      const {reposByOrg, excludedReposByOrg} = this.getSelectedReposByOrg(
        Array.from(repositories),
        Array.from(excludedRepositories)
      );
      this.filterConfig.reposByOrg = reposByOrg;
      this.filterConfig.excludedReposByOrg = excludedReposByOrg;
    }
    this.loadedSelectedRepos = true;
  }

  private getSelectedReposByOrg(
    repositories: ReadonlyArray<string> | undefined,
    excludedRepositories: ReadonlyArray<string> | undefined
  ): {
    reposByOrg: Map<string, Set<string>>;
    excludedReposByOrg: Map<string, Set<string>>;
  } {
    const reposByOrg = new Map<string, Set<string>>();
    const excludedReposByOrg = new Map<string, Set<string>>();
    const {logger, entityNames} = this.options;

    if (repositories?.length) {
      collectReposByOrg(reposByOrg, repositories);
    }
    if (excludedRepositories?.length) {
      collectReposByOrg(excludedReposByOrg, excludedRepositories);
    }

    for (const org of reposByOrg.keys()) {
      if (excludedReposByOrg.has(org)) {
        logger.warn(
          `Both ${this.options.configFields.repos} and ${this.options.configFields.excludedRepos} are specified for ${entityNames.org} ${org}, ${this.options.configFields.excludedRepos} for ${entityNames.org} ${org} will be ignored.`
        );
        excludedReposByOrg.delete(org);
      }
    }

    return {reposByOrg, excludedReposByOrg};
  }

  private hasFarosClient(): boolean {
    return Boolean(this.options.farosClient);
  }
}
