import {AirbyteLogger} from 'faros-airbyte-cdk';
import {getFarosOptions} from 'faros-airbyte-common/common';
import {FarosClient} from 'faros-js-client';
import {toString, toUpper} from 'lodash';
import {Memoize} from 'typescript-memoize';
import VError from 'verror';

import {DEFAULT_GRAPH, Jira, JiraConfig} from './jira';

export type ProjectOrBoardInclusion = {
  uid: string;
  issueSync: boolean;
};

export type FilterConfig = {
  projects?: Set<string>;
  excludedProjects?: Set<string>;
  boards?: Set<string>;
  excludedBoards?: Set<string>;
};

export class ProjectBoardFilter {
  protected filterConfig: FilterConfig;
  protected readonly useFarosGraphBoardsSelection: boolean;
  protected projects?: Map<string, ProjectOrBoardInclusion>;
  private boards?: Map<string, ProjectOrBoardInclusion>;
  private loadedSelectedBoards: boolean = false;

  protected static _instance: ProjectBoardFilter;
  static instance(
    config: JiraConfig,
    logger: AirbyteLogger,
    farosClient?: FarosClient
  ): ProjectBoardFilter {
    if (!this._instance) {
      this._instance = new ProjectBoardFilter(config, logger, farosClient);
    }
    return this._instance;
  }

  constructor(
    protected readonly config: JiraConfig,
    protected readonly logger: AirbyteLogger,
    protected readonly farosClient?: FarosClient
  ) {
    this.useFarosGraphBoardsSelection =
      config.use_faros_graph_boards_selection ?? false;

    const {projects} = config;
    let {excluded_projects, boards, excluded_boards} = config;

    if (projects?.length && excluded_projects?.length) {
      logger.warn(
        'Both projects and excluded_projects are specified, excluded_projects will be ignored.'
      );
      excluded_projects = undefined;
    }

    if (!this.useFarosGraphBoardsSelection) {
      if (boards?.length && excluded_boards?.length) {
        logger.warn(
          'Both boards and excluded_boards are specified, excluded_boards will be ignored.'
        );
        excluded_boards = undefined;
      }
      this.loadedSelectedBoards = true;
    } else {
      if (!this.hasFarosClient()) {
        throw new VError(
          'Faros credentials are required when using Faros Graph for boards selection'
        );
      }
      if (boards?.length || excluded_boards?.length) {
        logger.warn(
          'Using Faros Graph for boards selection but boards and/or excluded_boards are specified, both will be ignored.'
        );
        boards = undefined;
        excluded_boards = undefined;
      }
    }

    this.filterConfig = {
      projects: projects?.length ? new Set(projects) : undefined,
      excludedProjects: excluded_projects?.length
        ? new Set(excluded_projects)
        : undefined,
      boards: boards?.length ? new Set(boards) : undefined,
      excludedBoards: excluded_boards?.length
        ? new Set(excluded_boards)
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
        const projects =
          this.isWebhookSupplementMode() && this.hasFarosClient()
            ? jira.getProjectsFromGraph(
                this.farosClient,
                this.config.graph ?? DEFAULT_GRAPH
              )
            : await jira.getProjects();
        for await (const project of projects) {
          if (!this.filterConfig.excludedProjects?.has(project.key)) {
            this.projects.set(project.key, {uid: project.key, issueSync: true});
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

  protected async getProjectsFromConfig(): Promise<void> {
    const jira = await Jira.instance(this.config, this.logger);
    const visibleProjects = await jira.getProjects();
    const keys = new Set(visibleProjects.map((p) => p.key));
    const ids = new Set(visibleProjects.map((p) => p.id));
    for (const project of this.filterConfig.projects) {
      if (!keys.has(project) && !ids.has(project)) {
        this.logger.warn(
          `Project ${project} defined in config is not visible in Jira instance. Skipping.`
        );
        continue;
      }
      const {included, issueSync} = await this.getProjectInclusion(project);
      if (jira.isProjectInBucket(project) && included) {
        const projectKey = toUpper(project);
        this.projects.set(projectKey, {uid: projectKey, issueSync});
      }
    }
  }

  @Memoize()
  async getBoards(): Promise<ReadonlyArray<ProjectOrBoardInclusion>> {
    if (!this.boards) {
      this.boards = new Map();

      const jira = await Jira.instance(this.config, this.logger);

      // Ensure projects is populated
      await this.getProjects();

      // Ensure included / excluded boards are loaded
      await this.loadSelectedBoards();

      if (this.isWebhookSupplementMode() && this.hasFarosClient()) {
        await this.getBoardsFromFaros(jira);
      } else {
        await this.getBoardsFromJira(jira);
      }
    }
    return Array.from(this.boards.values());
  }

  async getProjectInclusion(project: string): Promise<{
    included: boolean;
    issueSync: boolean;
  }> {
    return {included: true, issueSync: true};
  }

  /**
   * Determines how a board should be included in the sync.
   * 1. When using Faros Graph, all boards are included for boards stream but
   *    only those explicitly included in the Faros Graph are synced.
   * 2. When not using Faros Graph, boards are included if they are in the
   *    `boards` set or not in the `excludedBoards` set.
   *
   * @returns An object containing:
   *   - included: Whether the board should be included in the sync.
   *   - syncIssues: Whether the issues from this board should be synced.
   */
  async getBoardInclusion(board: string): Promise<{
    included: boolean;
    issueSync: boolean;
  }> {
    await this.loadSelectedBoards();
    const {boards, excludedBoards} = this.filterConfig;

    if (this.useFarosGraphBoardsSelection) {
      const included = true;

      const issueSync =
        (!boards?.size || boards.has(board)) && !excludedBoards?.has(board);
      return {included, issueSync};
    }
    if (boards?.size) {
      const included = boards.has(board);
      return {included, issueSync: included};
    }

    if (excludedBoards?.size) {
      const included = !excludedBoards.has(board);
      return {included, issueSync: included};
    }
    return {included: true, issueSync: true};
  }

  /**
   * Retrieves boards from Jira for all projects and populates the internal boards map.
   * Only includes boards based on the inclusion criteria determined by getBoardInclusion.
   *
   * @param jira - The Jira instance used to fetch project boards.
   * @returns A Promise that resolves when all boards have been processed.
   */
  private async getBoardsFromJira(jira: Jira): Promise<void> {
    this.logger.info('Fetching boards to sync from Jira.');
    for (const project of this.projects.keys()) {
      this.logger.info(`Fetching boards to sync for project ${project}`);
      for (const board of await jira.getProjectBoards(project)) {
        const boardId = toString(board.id);
        const {included, issueSync} = await this.getBoardInclusion(boardId);
        if (included) {
          this.boards.set(boardId, {uid: boardId, issueSync});
        }
      }
    }
  }

  private async getBoardsFromFaros(jira: Jira): Promise<void> {
    this.logger.info('Fetching boards to sync from Faros Graph.');
    const projects = jira.getProjectBoardsFromGraph(
      this.farosClient,
      this.config.graph ?? DEFAULT_GRAPH,
      Array.from(this.projects.keys())
    );
    for await (const project of projects) {
      for (const board of project.boardUids) {
        const {included, issueSync} = await this.getBoardInclusion(board);
        if (included) {
          this.boards.set(board, {uid: board, issueSync});
        }
      }
    }
  }

  private async loadSelectedBoards(): Promise<void> {
    if (this.loadedSelectedBoards) {
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
      const {included: boards} = farosOptions;
      let {excluded: excludedBoards} = farosOptions;
      if (boards?.size && excludedBoards?.size) {
        this.logger.warn(
          'FarosGraph detected both included and excluded boards, excluded boards will be ignored.'
        );
        excludedBoards = undefined;
      }
      this.filterConfig.boards = boards.size ? boards : undefined;
      this.filterConfig.excludedBoards = excludedBoards?.size
        ? excludedBoards
        : undefined;
    }
    this.loadedSelectedBoards = true;
  }

  private isWebhookSupplementMode(): boolean {
    return this.config.run_mode === 'WebhookSupplement';
  }

  protected hasFarosClient(): boolean {
    return Boolean(this.farosClient);
  }
}
