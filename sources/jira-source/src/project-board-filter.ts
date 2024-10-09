import {AirbyteLogger} from 'faros-airbyte-cdk';
import {getFarosOptions} from 'faros-airbyte-common/common';
import {FarosClient} from 'faros-js-client';
import {toString, toUpper} from 'lodash';
import {Memoize} from 'typescript-memoize';
import VError from 'verror';

import {DEFAULT_GRAPH, Jira, JiraConfig} from './jira';
import {RunMode} from './streams/common';

type FilterConfig = {
  projects?: Set<string>;
  excludedProjects?: Set<string>;
  boards?: Set<string>;
  excludedBoards?: Set<string>;
};

export class ProjectBoardFilter {
  private readonly filterConfig: FilterConfig;
  private readonly useFarosGraphBoardsSelection: boolean;
  private projects?: Set<string>;
  private boards?: Set<string>;
  private loadedSelectedBoards: boolean = false;

  private static _instance: ProjectBoardFilter;
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
    private readonly config: JiraConfig,
    private readonly logger: AirbyteLogger,
    private readonly farosClient?: FarosClient
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
  async getProjects(): Promise<ReadonlyArray<string>> {
    if (!this.projects) {
      this.projects = new Set();

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
            this.projects.add(project.key);
          }
        }
      } else {
        for (const project of this.filterConfig.projects) {
          if (jira.isProjectInBucket(project)) {
            this.projects.add(toUpper(project));
          }
        }
      }
    }
    return Array.from(this.projects);
  }

  @Memoize()
  async getBoards(): Promise<ReadonlyArray<string>> {
    if (!this.boards) {
      this.boards = new Set();

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
    return Array.from(this.boards);
  }

  boardIsIncluded(board: string): boolean {
    const {boards, excludedBoards} = this.filterConfig;
    if (boards?.size) {
      return boards.has(board);
    }
    if (excludedBoards?.size) {
      return !excludedBoards.has(board);
    }
    return true;
  }

  private async getBoardsFromJira(jira: Jira): Promise<void> {
    for (const project of this.projects) {
      for (const board of await jira.getProjectBoards(project)) {
        const boardId = toString(board.id);
        if (this.boardIsIncluded(boardId)) {
          this.boards.add(boardId);
        }
      }
    }
  }

  private async getBoardsFromFaros(jira: Jira): Promise<void> {
    const projects = jira.getProjectBoardsFromGraph(
      this.farosClient,
      this.config.graph ?? DEFAULT_GRAPH,
      Array.from(this.projects)
    );
    for await (const project of projects) {
      for (const board of project.boardUids) {
        if (this.boardIsIncluded(board)) {
          this.boards.add(board);
        }
      }
    }
  }

  private async loadSelectedBoards(): Promise<void> {
    if (this.loadedSelectedBoards) {
      return;
    }
    if (this.useFarosGraphBoardsSelection) {
      const farosOptions = await getFarosOptions(
        'board',
        'Jira',
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
    return this.config.run_mode === RunMode.WebhookSupplement;
  }

  private hasFarosClient(): boolean {
    return Boolean(this.farosClient);
  }
}
