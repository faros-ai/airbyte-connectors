import {AirbyteLogger} from 'faros-airbyte-cdk';
import {getFarosOptions} from 'faros-airbyte-common/common';
import {FarosClient} from 'faros-js-client';
import {toString, toUpper} from 'lodash';
import {Memoize} from 'typescript-memoize';
import VError from 'verror';

import {DEFAULT_GRAPH, Jira, JiraConfig} from './jira';
import {RunMode} from './streams/common';

type BoardInclusion = {uid: string; syncIssues: boolean};

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
  private boards?: Map<string, BoardInclusion>;
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
  async getBoards(): Promise<ReadonlyArray<BoardInclusion>> {
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

  /**
   * Determines how a board should be included in the sync.
   * 1. When using Faros Graph, all boards are included but only those explicitly
   *    included in the Faros Graph are synced.
   * 2. When not using Faros Graph, boards are included if they are in the
   *    `boards` set or not in the `excludedBoards` set.
   *
   * @returns An object containing:
   *   - included: Whether the board should be included in the sync.
   *   - syncIssues: Whether the issues from this board should be synced.
   */
  getBoardInclusion(board: string): {
    included: boolean;
    syncIssues: boolean;
  } {
    const {boards, excludedBoards} = this.filterConfig;

    if (this.useFarosGraphBoardsSelection) {
      const included = true;
      const syncIssues = !(
        excludedBoards?.has(board) ||
        (!boards?.has(board) && !excludedBoards?.has(board))
      );
      return {included, syncIssues};
    }

    const included = boards?.has(board) || !excludedBoards?.has(board);
    const syncIssues = included;
    return {included, syncIssues};
  }

  /**
   * Retrieves boards from Jira for all projects and populates the internal boards map.
   * Only includes boards based on the inclusion criteria determined by getBoardInclusion.
   *
   * @param jira - The Jira instance used to fetch project boards.
   * @returns A Promise that resolves when all boards have been processed.
   */
  private async getBoardsFromJira(jira: Jira): Promise<void> {
    for (const project of this.projects) {
      for (const board of await jira.getProjectBoards(project)) {
        const boardId = toString(board.id);
        const {included, syncIssues} = this.getBoardInclusion(boardId);
        if (included) {
          this.boards.set(boardId, {uid: boardId, syncIssues: syncIssues});
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
        if (this.getBoardInclusion(board)) {
          this.boards.set(board, {uid: board, syncIssues: true});
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
