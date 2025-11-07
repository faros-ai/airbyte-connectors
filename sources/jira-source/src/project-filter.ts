import {AirbyteLogger} from 'faros-airbyte-cdk';
import {FarosClient} from 'faros-js-client';
import {Memoize} from 'typescript-memoize';

import {Jira, JiraConfig} from './jira';
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

    const {items: projects, excludedItems: excluded_projects} =
      this.verifyListsWithGraphSelection(
        config.projects,
        config.excluded_projects,
        'projects'
      );

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

    const allProjects = Array.from(this.projects.values());

    // Apply bucketing filter if configured
    if (!this.config.bucketing) {
      return allProjects;
    }

    return this.config.bucketing.filter(allProjects, ({uid}) => uid);
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
