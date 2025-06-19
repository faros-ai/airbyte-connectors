import {AirbyteLogger} from 'faros-airbyte-cdk';
import {
  RepoInclusion,
  VCSAdapter,
  VCSFilter,
} from 'faros-airbyte-common/common';
import {FarosProjectOutput, Group} from 'faros-airbyte-common/gitlab';
import {FarosClient} from 'faros-js-client';
import {Memoize} from 'typescript-memoize';

import {DEFAULT_FAROS_GRAPH, GitLab} from './gitlab';
import {GitLabConfig} from './types';

/**
 * GitLab VCS adapter implementation
 */
class GitLabVCSAdapter implements VCSAdapter<Group, FarosProjectOutput> {
  constructor(
    private readonly config: GitLabConfig,
    private readonly logger: AirbyteLogger,
  ) {}

  async getOrgs(): Promise<string[]> {
    const gitlab = await GitLab.instance(this.config, this.logger);
    const groups = await gitlab.getGroups();
    return groups.map((group) => group.id);
  }

  async getOrg(orgName: string): Promise<Group> {
    const gitlab = await GitLab.instance(this.config, this.logger);
    return gitlab.getGroup(orgName);
  }

  async getRepos(orgName: string): Promise<FarosProjectOutput[]> {
    const gitlab = await GitLab.instance(this.config, this.logger);
    return gitlab.getProjects(orgName);
  }

  getRepoName(repo: FarosProjectOutput): string {
    return repo.path;
  }
}

/**
 * Type-safe configuration field mapping for GitLab
 * This ensures that the values in configFields are actual keys of GitLabConfig
 */
interface GitLabConfigFields {
  orgs: keyof GitLabConfig & 'groups';
  excludedOrgs: keyof GitLabConfig & 'excluded_groups';
  repos: keyof GitLabConfig & 'projects';
  excludedRepos: keyof GitLabConfig & 'excluded_projects';
  useFarosGraphReposSelection: keyof GitLabConfig &
    'use_faros_graph_projects_selection';
  graph: keyof GitLabConfig & 'graph';
}

export class GroupFilter {
  private readonly vcsFilter: VCSFilter<
    GitLabConfig,
    Group,
    FarosProjectOutput
  >;
  private static _instance: GroupFilter;

  static instance(
    config: GitLabConfig,
    logger: AirbyteLogger,
    farosClient?: FarosClient,
  ): GroupFilter {
    if (!this._instance) {
      this._instance = new GroupFilter(config, logger, farosClient);
    }
    return this._instance;
  }

  constructor(
    private readonly config: GitLabConfig,
    private readonly logger: AirbyteLogger,
    private readonly farosClient?: FarosClient,
  ) {
    // Initialize the VCS filter with GitLab-specific configuration
    const configFields: GitLabConfigFields = {
      orgs: 'groups',
      excludedOrgs: 'excluded_groups',
      repos: 'projects',
      excludedRepos: 'excluded_projects',
      useFarosGraphReposSelection: 'use_faros_graph_projects_selection',
      graph: 'graph',
    };

    this.vcsFilter = new VCSFilter({
      config,
      logger,
      farosClient,
      configFields,
      entityNames: {
        org: 'group',
        orgs: 'groups',
        repo: 'project',
        repos: 'projects',
        platform: 'GitLab',
      },
      vcsAdapter: new GitLabVCSAdapter(config, logger),
      defaultGraph: DEFAULT_FAROS_GRAPH,
      useFarosGraphReposSelection:
        config.use_faros_graph_projects_selection ?? false,
    });
  }

  @Memoize()
  async getGroups(): Promise<ReadonlyArray<string>> {
    return await this.vcsFilter.getOrgs();
  }

  @Memoize()
  async getProjects(
    group: string,
  ): Promise<ReadonlyArray<RepoInclusion<FarosProjectOutput>>> {
    return this.vcsFilter.getRepos(group);
  }

  async getProjectInclusion(
    group: string,
    project: string,
  ): Promise<{
    included: boolean;
    syncRepoData: boolean;
  }> {
    return this.vcsFilter.getRepoInclusion(group, project);
  }

  getProject(group: string, path: string): FarosProjectOutput {
    return this.vcsFilter.getRepository(group, path);
  }
}
