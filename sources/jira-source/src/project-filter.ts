import {AirbyteLogger} from 'faros-airbyte-cdk';
import {getFarosOptions} from 'faros-airbyte-common/common';
import {FarosClient} from 'faros-js-client';
import {Memoize} from 'typescript-memoize';
import VError from 'verror';

import {DEFAULT_GRAPH, Jira, JiraConfig} from './jira';
import {
  ProjectBoardFilter,
  ProjectOrBoardInclusion,
} from './project-board-filter';

export class ProjectFilter extends ProjectBoardFilter {
  private loadedSelectedProjects = false;

  static instance(
    config: JiraConfig,
    logger: AirbyteLogger,
    farosClient?: FarosClient
  ): ProjectBoardFilter {
    if (!this._instance) {
      this._instance = new ProjectFilter(config, logger, farosClient);
    }
    return this._instance;
  }

  constructor(
    config: JiraConfig,
    logger: AirbyteLogger,
    farosClient?: FarosClient
  ) {
    super(config, logger, farosClient);

    let {projects, excluded_projects} = config;

    if (!this.useFarosGraphBoardsSelection) {
      if (projects?.length && excluded_projects?.length) {
        logger.warn(
          'Both projects and excluded_projects are specified, excluded_projects will be ignored.'
        );
        excluded_projects = undefined;
      }
      this.loadedSelectedProjects = true;
    } else {
      if (!this.hasFarosClient()) {
        throw new VError(
          'Faros credentials are required when using Faros Graph for projects selection'
        );
      }
      if (projects?.length || excluded_projects?.length) {
        logger.warn(
          'Using Faros Graph for project selection but project and/or excluded_projects are specified, both will be ignored.'
        );
        projects = undefined;
        excluded_projects = undefined;
      }
    }

    this.filterConfig = {
      projects: projects?.length ? new Set(projects) : undefined,
      excludedProjects: excluded_projects?.length
        ? new Set(excluded_projects)
        : undefined,
    };
  }

  @Memoize()
  async getProjects(): Promise<ReadonlyArray<ProjectOrBoardInclusion>> {
    if (!this.projects) {
      this.logger.info('Generating list of projects to sync');
      this.projects = new Map();

      const jira = await Jira.instance(this.config, this.logger);

      await this.loadSelectedProjects();

      if (!this.filterConfig.projects?.size) {
        const projects = await jira.getProjects();
        for await (const project of projects) {
          const {included, issueSync} = await this.getProjectInclusion(
            project.key
          );
          if (included) {
            this.projects.set(project.key, {uid: project.key, issueSync});
          }
        }
      } else {
        await this.getProjectsFromConfig();
      }
      this.logger.info(
        `Will sync ${this.projects.size} projects: ` +
          `${Array.from(this.projects.keys()).join(', ')}`
      );
    }
    return Array.from(this.projects.values());
  }

  @Memoize()
  async getBoards(): Promise<ReadonlyArray<ProjectOrBoardInclusion>> {
    return this.getProjects();
  }

  /**
   * Determines how a project should be included in the sync.
   * 1. When using Faros Graph, all projects are included for projects stream but
   *    only those explicitly included in the Faros Graph are synced.
   * 2. When not using Faros Graph, projects are included if they are in the
   *    `projects` set or not in the `excludedProjects` set.
   *
   * @returns An object containing:
   *   - included: Whether the board should be included in the sync.
   *   - syncIssues: Whether the issues from this board should be synced.
   */
  async getProjectInclusion(project: string): Promise<{
    included: boolean;
    issueSync: boolean;
  }> {
    await this.loadSelectedProjects();
    const {projects, excludedProjects} = this.filterConfig;

    if (this.useFarosGraphBoardsSelection) {
      const included = true;

      const issueSync =
        (!projects?.size || projects.has(project)) &&
        !excludedProjects?.has(project);
      return {included, issueSync};
    }

    if (projects?.size) {
      const included = projects.has(project);
      return {included, issueSync: included};
    }

    if (excludedProjects?.size) {
      const included = !excludedProjects.has(project);
      return {included, issueSync: included};
    }
    return {included: true, issueSync: true};
  }

  private async loadSelectedProjects(): Promise<void> {
    if (this.loadedSelectedProjects) {
      return;
    }
    if (this.useFarosGraphBoardsSelection) {
      const source = this.config.source_qualifier
        ? `Jira_${this.config.source_qualifier}`
        : 'Jira';
      const farosOptions = await getFarosOptions(
        'board',
        source,
        this.farosClient,
        this.config.graph ?? DEFAULT_GRAPH
      );
      const {included: projects} = farosOptions;
      let {excluded: excludedProjects} = farosOptions;
      if (projects?.size && excludedProjects?.size) {
        this.logger.warn(
          'FarosGraph detected both included and excluded projects, excluded projects will be ignored.'
        );
        excludedProjects = undefined;
      }
      this.filterConfig.projects = projects.size ? projects : undefined;
      this.filterConfig.excludedProjects = excludedProjects?.size
        ? excludedProjects
        : undefined;
    }
    this.loadedSelectedProjects = true;
  }
}
