import {AirbyteLogger} from 'faros-airbyte-cdk';
import {collectReposByOrg, getFarosOptions} from 'faros-airbyte-common/common';
import {Repository} from 'faros-airbyte-common/github';
import {FarosClient} from 'faros-js-client';
import {toLower} from 'lodash';
import {Memoize} from 'typescript-memoize';
import VError from 'verror';

import {DEFAULT_FAROS_GRAPH, GitHub} from './github';
import {GitHubConfig} from './types';

type FilterConfig = {
  organizations?: Set<string>;
  excludedOrganizations?: Set<string>;
  reposByOrg?: Map<string, Set<string>>;
  excludedReposByOrg?: Map<string, Set<string>>;
};

export class OrgRepoFilter {
  private readonly filterConfig: FilterConfig;
  private readonly useFarosGraphReposSelection: boolean;
  private organizations?: Set<string>;
  private reposByOrg: Map<string, Map<string, Repository>> = new Map();
  private loadedSelectedRepos: boolean = false;

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
    this.useFarosGraphReposSelection =
      config.use_faros_graph_repos_selection ?? false;

    const {organizations, repositories, excluded_repositories} = this.config;
    let {excluded_organizations} = this.config;

    if (organizations?.length && excluded_organizations?.length) {
      this.logger.warn(
        'Both organizations and excluded_organizations are specified, excluded_organizations will be ignored.'
      );
      excluded_organizations = undefined;
    }

    let reposByOrg: Map<string, Set<string>>;
    let excludedReposByOrg: Map<string, Set<string>>;
    if (!this.useFarosGraphReposSelection) {
      ({reposByOrg, excludedReposByOrg} = this.getSelectedReposByOrg(
        repositories,
        excluded_repositories
      ));
      this.loadedSelectedRepos = true;
    } else {
      if (!this.hasFarosClient()) {
        throw new VError(
          'Faros credentials are required when using Faros Graph for boards selection'
        );
      }
      if (repositories?.length || excluded_repositories?.length) {
        logger.warn(
          'Using Faros Graph for repositories selection but repositories and/or excluded_repositories are specified, both will be ignored.'
        );
      }
    }

    this.filterConfig = {
      organizations: organizations?.length ? new Set(organizations) : undefined,
      excludedOrganizations: excluded_organizations?.length
        ? new Set(excluded_organizations)
        : undefined,
      reposByOrg,
      excludedReposByOrg,
    };
  }

  @Memoize()
  async getOrganizations(): Promise<ReadonlyArray<string>> {
    if (!this.organizations) {
      const organizations = new Set<string>();
      const github = await GitHub.instance(this.config, this.logger);
      const visibleOrgs = await github.getOrganizations();
      if (!visibleOrgs.length) {
        this.logger.warn('No visible organizations found');
      }
      if (!this.filterConfig.organizations) {
        visibleOrgs.forEach((org) => {
          const lowerOrg = toLower(org);
          if (!this.filterConfig.excludedOrganizations?.has(lowerOrg)) {
            organizations.add(lowerOrg);
          }
        });
      } else {
        this.filterConfig.organizations.forEach((org) => {
          const lowerOrg = toLower(org);
          // fine-grained tokens return an empty list for visible orgs,
          // so we only run the check if the list is not empty
          if (
            visibleOrgs.length &&
            !visibleOrgs.some((o) => toLower(o) === lowerOrg)
          ) {
            this.logger.warn(`Skipping not found organization ${lowerOrg}`);
            return;
          }
          organizations.add(lowerOrg);
        });
      }
      this.organizations = organizations;
    }
    return Array.from(this.organizations);
  }

  @Memoize()
  async getRepositories(org: string): Promise<ReadonlyArray<Repository>> {
    const lowerOrg = toLower(org);

    // Ensure included / excluded repositories are loaded
    await this.loadSelectedRepos();

    if (!this.reposByOrg.has(lowerOrg)) {
      const repos = new Map<string, Repository>();
      const github = await GitHub.instance(this.config, this.logger);
      const visibleRepos = await github.getRepositories(lowerOrg);
      if (!visibleRepos.length) {
        this.logger.warn(
          `No visible repositories found for organization ${lowerOrg}`
        );
      }
      if (!this.filterConfig.reposByOrg.has(lowerOrg)) {
        visibleRepos.forEach((repo) => {
          const lowerRepoName = toLower(repo.name);
          if (
            !this.filterConfig.excludedReposByOrg
              .get(lowerOrg)
              ?.has(lowerRepoName)
          ) {
            repos.set(lowerRepoName, repo);
          }
        });
      } else {
        this.filterConfig.reposByOrg.get(lowerOrg).forEach((repoName) => {
          const lowerRepoName = toLower(repoName);
          const repo = visibleRepos.find(
            (r) => toLower(r.name) === lowerRepoName
          );
          if (!repo) {
            this.logger.warn(
              `Skipping not found repository ${lowerOrg}/${lowerRepoName}`
            );
            return;
          }
          repos.set(lowerRepoName, repo);
        });
      }
      this.reposByOrg.set(lowerOrg, repos);
    }
    return Array.from(this.reposByOrg.get(lowerOrg).values());
  }

  getRepository(org: string, name: string): Repository {
    const lowerOrg = toLower(org);
    const lowerRepoName = toLower(name);
    const repo = this.reposByOrg.get(lowerOrg)?.get(lowerRepoName);
    if (!repo) {
      throw new VError('Repository not found: %s/%s', lowerOrg, lowerRepoName);
    }
    return repo;
  }

  private async loadSelectedRepos(): Promise<void> {
    if (this.loadedSelectedRepos) {
      return;
    }
    if (this.useFarosGraphReposSelection) {
      const farosOptions = await getFarosOptions(
        'repository',
        'GitHub',
        this.farosClient,
        this.config.graph ?? DEFAULT_FAROS_GRAPH
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
    repositories: ReadonlyArray<string>,
    excludedRepositories: ReadonlyArray<string>
  ): {
    reposByOrg: Map<string, Set<string>>;
    excludedReposByOrg: Map<string, Set<string>>;
  } {
    const reposByOrg = new Map<string, Set<string>>();
    const excludedReposByOrg = new Map<string, Set<string>>();
    if (repositories?.length) {
      collectReposByOrg(reposByOrg, repositories);
    }
    if (excludedRepositories?.length) {
      collectReposByOrg(excludedReposByOrg, excludedRepositories);
    }
    for (const org of reposByOrg.keys()) {
      if (excludedReposByOrg.has(org)) {
        this.logger.warn(
          `Both repositories and excluded_repositories are specified for organization ${org}, excluded_repositories for organization ${org} will be ignored.`
        );
        excludedReposByOrg.delete(org);
      }
    }
    return {reposByOrg, excludedReposByOrg};
  }

  private hasFarosClient(): boolean {
    return Boolean(this.farosClient);
  }
}
