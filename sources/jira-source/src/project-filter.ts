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

/**
 * Extension of ProjectBoardFilter class modified to use projects as boards.
 * This class handles inclusion at a project level, and returns 1 artificial board per project.
 */
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

  async getProjectInclusion(project: string): Promise<{
    included: boolean;
    issueSync: boolean;
  }> {
    await this.loadSelectedProjects();
    return this.getInclusion(
      project,
      this.filterConfig.projects,
      this.filterConfig.excludedProjects
    );
  }

  private async loadSelectedProjects(): Promise<void> {
    if (this.loadedSelectedProjects) {
      return;
    }
    await this.loadItemsBasedOnInclusion('projects', 'excludedProjects');
    this.loadedSelectedProjects = true;
  }
}
