import {AirbyteLogger} from 'faros-airbyte-cdk';
import {collectReposByOrg, getFarosOptions} from 'faros-airbyte-common/common';
import {FarosClient} from 'faros-js-client';
import {toLower} from 'lodash';
import {Memoize} from 'typescript-memoize';
import VError from 'verror';

import {DEFAULT_FAROS_GRAPH, GitLab} from './gitlab';
import {GitLabConfig, Group, ProjectInclusion} from './types';

type FilterConfig = {
  groups?: Set<string>;
  excludedGroups?: Set<string>;
  projectsByGroup?: Map<string, Set<string>>;
  excludedProjectsByGroup?: Map<string, Set<string>>;
};

export class WorkspaceRepoFilter {
  private readonly filterConfig: FilterConfig;
  private readonly useFarosGraphReposSelection: boolean;
  private groups?: Set<string>;
  private projectsByGroup: Map<string, Map<string, ProjectInclusion>> = new Map();
  private loadedSelectedProjects: boolean = false;

  private static _instance: WorkspaceRepoFilter;
  static instance(
    config: GitLabConfig,
    logger: AirbyteLogger,
    farosClient?: FarosClient
  ): WorkspaceRepoFilter {
    if (!this._instance) {
      this._instance = new WorkspaceRepoFilter(config, logger, farosClient);
    }
    return this._instance;
  }

  constructor(
    private readonly config: GitLabConfig,
    private readonly logger: AirbyteLogger,
    private readonly farosClient?: FarosClient
  ) {
    this.useFarosGraphReposSelection = config.use_faros_graph_repos_selection ?? false;

    const {groups, projects, excluded_projects} = this.config;
    let {excluded_groups} = this.config;

    if (groups?.length && excluded_groups?.length) {
      this.logger.warn(
        'Both groups and excluded_groups are specified, excluded_groups will be ignored.'
      );
      excluded_groups = undefined;
    }

    let projectsByGroup: Map<string, Set<string>>;
    let excludedProjectsByGroup: Map<string, Set<string>>;
    
    if (!this.useFarosGraphReposSelection) {
      ({projectsByGroup, excludedProjectsByGroup} = this.getSelectedProjectsByGroup(
        projects,
        excluded_projects
      ));
      this.loadedSelectedProjects = true;
    } else {
      if (!this.hasFarosClient()) {
        throw new VError(
          'Faros credentials are required when using Faros Graph for repositories selection'
        );
      }
      if (projects?.length || excluded_projects?.length) {
        logger.warn(
          'Using Faros Graph for repositories selection but projects and/or excluded_projects are specified, both will be ignored.'
        );
      }
    }

    this.filterConfig = {
      groups: groups?.length ? new Set(groups.map(toLower)) : undefined,
      excludedGroups: excluded_groups?.length
        ? new Set(excluded_groups.map(toLower))
        : undefined,
      projectsByGroup,
      excludedProjectsByGroup,
    };
  }

  @Memoize()
  async getGroups(): Promise<ReadonlyArray<string>> {
    if (!this.groups) {
      const gitlab = await GitLab.instance(this.config, this.logger);
      const visibleGroups = new Set(
        (await gitlab.getGroups()).map((g) => toLower(g.path))
      );

      if (!visibleGroups.size) {
        this.logger.warn('No visible groups found');
      }

      this.groups = await this.filterGroups(visibleGroups, gitlab);
    }

    if (this.groups.size === 0) {
      throw new VError(
        'No visible groups remain after applying inclusion and exclusion filters'
      );
    }

    return Array.from(this.groups);
  }

  private async filterGroups(
    visibleGroups: Set<string>,
    gitlab: GitLab
  ): Promise<Set<string>> {
    const groups = new Set<string>();

    if (!this.filterConfig.groups) {
      for (const group of visibleGroups) {
        const lowerGroup = toLower(group);
        if (!this.filterConfig.excludedGroups?.has(lowerGroup)) {
          groups.add(lowerGroup);
        } else {
          this.logger.info(`Skipping excluded group ${lowerGroup}`);
        }
      }
    } else {
      for (const group of this.filterConfig.groups) {
        const lowerGroup = toLower(group);
        if (await this.isVisibleGroup(visibleGroups, lowerGroup, gitlab)) {
          groups.add(lowerGroup);
        }
      }
    }

    return groups;
  }

  private async isVisibleGroup(
    visibleGroups: Set<string>,
    lowerGroup: string,
    gitlab: GitLab
  ): Promise<boolean> {
    if (visibleGroups.has(lowerGroup)) {
      return true;
    }

    try {
      await gitlab.getGroup(lowerGroup);
      return true;
    } catch (error: any) {
      this.logger.warn(
        `Fetching group ${lowerGroup} failed with error: ` +
          `${error.status} - ${error.message}. Skipping.`
      );
      return false;
    }
  }

  @Memoize()
  async getProjects(group: string): Promise<ReadonlyArray<ProjectInclusion>> {
    const lowerGroup = toLower(group);

    await this.loadSelectedProjects();

    if (!this.projectsByGroup.has(lowerGroup)) {
      const projects = new Map<string, ProjectInclusion>();
      const gitlab = await GitLab.instance(this.config, this.logger);
      const visibleProjects = await gitlab.getProjects(lowerGroup);
      if (!visibleProjects.length) {
        this.logger.warn(
          `No visible projects found for group ${lowerGroup}`
        );
      }
      for (const project of visibleProjects) {
        const lowerProjectName = toLower(project.path);
        const {included, syncProjectData} = await this.getProjectInclusion(
          lowerGroup,
          lowerProjectName
        );
        if (included) {
          projects.set(lowerProjectName, {project, syncProjectData});
        }
      }
      this.projectsByGroup.set(lowerGroup, projects);
    }
    return Array.from(this.projectsByGroup.get(lowerGroup).values());
  }

  async getProjectInclusion(
    group: string,
    project: string
  ): Promise<{
    included: boolean;
    syncProjectData: boolean;
  }> {
    await this.loadSelectedProjects();
    const {projectsByGroup, excludedProjectsByGroup} = this.filterConfig;
    const projects = projectsByGroup.get(group);
    const excludedProjects = excludedProjectsByGroup.get(group);

    if (this.useFarosGraphReposSelection) {
      const included = true;

      const syncProjectData =
        (!projects?.size || projects.has(project)) && !excludedProjects?.has(project);
      return {included, syncProjectData};
    }

    if (projects?.size) {
      const included = projects.has(project);
      return {included, syncProjectData: included};
    }

    if (excludedProjects?.size) {
      const included = !excludedProjects.has(project);
      return {included, syncProjectData: included};
    }
    return {included: true, syncProjectData: true};
  }

  private async loadSelectedProjects(): Promise<void> {
    if (this.loadedSelectedProjects) {
      return;
    }
    if (this.useFarosGraphReposSelection) {
      const farosOptions = await getFarosOptions(
        'repository',
        'GitLab',
        this.farosClient,
        this.config.graph ?? DEFAULT_FAROS_GRAPH
      );
      const {included: projects, excluded: excludedProjects} =
        farosOptions;
      const {projectsByGroup, excludedProjectsByGroup} = this.getSelectedProjectsByGroup(
        Array.from(projects),
        Array.from(excludedProjects)
      );
      this.filterConfig.projectsByGroup = projectsByGroup;
      this.filterConfig.excludedProjectsByGroup = excludedProjectsByGroup;
    }
    this.loadedSelectedProjects = true;
  }

  private getSelectedProjectsByGroup(
    projects: ReadonlyArray<string>,
    excludedProjects: ReadonlyArray<string>
  ): {
    projectsByGroup: Map<string, Set<string>>;
    excludedProjectsByGroup: Map<string, Set<string>>;
  } {
    const projectsByGroup = new Map<string, Set<string>>();
    const excludedProjectsByGroup = new Map<string, Set<string>>();
    if (projects?.length) {
      collectReposByOrg(projectsByGroup, projects);
    }
    if (excludedProjects?.length) {
      collectReposByOrg(excludedProjectsByGroup, excludedProjects);
    }
    for (const group of projectsByGroup.keys()) {
      if (excludedProjectsByGroup.has(group)) {
        this.logger.warn(
          `Both projects and excluded_projects are specified for group ${group}, excluded_projects for group ${group} will be ignored.`
        );
        excludedProjectsByGroup.delete(group);
      }
    }
    return {projectsByGroup, excludedProjectsByGroup};
  }

  private hasFarosClient(): boolean {
    return Boolean(this.farosClient);
  }
}
