import {AirbyteLogger} from 'faros-airbyte-cdk';
import {VCSFilter, VCSAdapter, RepoInclusion} from 'faros-airbyte-common/common';
import {Organization, Repository} from 'faros-airbyte-common/github';
import {FarosClient} from 'faros-js-client';
import {Memoize} from 'typescript-memoize';
import VError from 'verror';

import {DEFAULT_FAROS_GRAPH, GitHub} from './github';
import {RunMode} from './streams/common';
import {GitHubConfig} from './types';

/**
 * GitHub VCS adapter implementation
 */
class GitHubVCSAdapter implements VCSAdapter<Organization, Repository> {
  constructor(
    private readonly config: GitHubConfig,
    private readonly logger: AirbyteLogger
  ) {}

  async getOrgs(): Promise<string[]> {
    const github = await GitHub.instance(this.config, this.logger);
    return Array.from(await github.getOrganizations());
  }

  async getOrg(orgName: string): Promise<Organization> {
    const github = await GitHub.instance(this.config, this.logger);
    return github.getOrganization(orgName);
  }

  async getRepos(orgName: string): Promise<Repository[]> {
    const github = await GitHub.instance(this.config, this.logger);
    return Array.from(await github.getRepositories(orgName));
  }

  getRepoName(repo: Repository): string {
    return repo.name;
  }
}

/**
 * Type-safe configuration field mapping for GitHub
 * This ensures that the values in configFields are actual keys of GitHubConfig
 */
type GitHubConfigFields = {
  orgs: keyof GitHubConfig & 'organizations';
  excludedOrgs: keyof GitHubConfig & 'excluded_organizations';
  repos: keyof GitHubConfig & 'repositories';
  excludedRepos: keyof GitHubConfig & 'excluded_repositories';
  useFarosGraphReposSelection: keyof GitHubConfig & 'use_faros_graph_repos_selection';
  graph: keyof GitHubConfig & 'graph';
};

export class OrgRepoFilter {
  private readonly vcsFilter: VCSFilter<GitHubConfig, Organization, Repository>;
  private static _instance: OrgRepoFilter;
  
  static instance(
    config: GitHubConfig,
    logger: AirbyteLogger,
    farosClient?: FarosClient
  ): OrgRepoFilter {
    if (!this._instance) {
      this._instance = new OrgRepoFilter(config, logger, farosClient);
    }
    return this._instance;
  }

  constructor(
    private readonly config: GitHubConfig,
    private readonly logger: AirbyteLogger,
    private readonly farosClient?: FarosClient
  ) {
    // Initialize the VCS filter with GitHub-specific configuration
    const configFields: GitHubConfigFields = {
      orgs: 'organizations',
      excludedOrgs: 'excluded_organizations',
      repos: 'repositories',
      excludedRepos: 'excluded_repositories',
      useFarosGraphReposSelection: 'use_faros_graph_repos_selection',
      graph: 'graph'
    };

    this.vcsFilter = new VCSFilter({
      config,
      logger,
      farosClient,
      configFields,
      entityNames: {
        org: 'organization',
        orgs: 'organizations',
        repo: 'repository',
        repos: 'repositories',
        platform: 'GitHub'
      },
      vcsAdapter: new GitHubVCSAdapter(config, logger),
      defaultGraph: DEFAULT_FAROS_GRAPH,
      useFarosGraphReposSelection: config.use_faros_graph_repos_selection ?? false
    });
  }

  @Memoize()
  async getOrganizations(): Promise<ReadonlyArray<string>> {
    try {
      return await this.vcsFilter.getOrgs();
    } catch (error) {
      // If in EnterpriseCopilotOnly mode and no orgs are found, return empty array
      if (
        this.config.run_mode === RunMode.EnterpriseCopilotOnly &&
        error instanceof VError &&
        VError.info(error)?.code === 'NO_VISIBLE_ORGS'
      ) {
        return [];
      }
      // Re-throw the error for other cases
      throw error;
    }
  }


  @Memoize()
  async getRepositories(org: string): Promise<ReadonlyArray<RepoInclusion<Repository>>> {
    return this.vcsFilter.getRepos(org);
  }

  async getRepoInclusion(
    org: string,
    repo: string
  ): Promise<{
    included: boolean;
    syncRepoData: boolean;
  }> {
    return this.vcsFilter.getRepoInclusion(org, repo);
  }

  getRepository(org: string, name: string): Repository {
    return this.vcsFilter.getRepository(org, name);
  }
}
