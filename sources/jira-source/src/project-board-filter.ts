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
    farosClient?: FarosClient,
    isWebhookSupplementMode?: boolean
  ): ProjectBoardFilter {
    if (!this._instance) {
      this._instance = new ProjectBoardFilter(
        config,
        logger,
        farosClient,
        isWebhookSupplementMode
      );
    }
    return this._instance;
  }

  constructor(
    protected readonly config: JiraConfig,
    protected readonly logger: AirbyteLogger,
    protected readonly farosClient?: FarosClient,
    private readonly isWebhookSupplementMode?: boolean
  ) {
    this.useFarosGraphBoardsSelection =
      config.use_faros_graph_boards_selection ?? false;

    const {projects} = config;
    let {excluded_projects} = config;

    excluded_projects = this.verifyExclusionList(
      projects,
      excluded_projects,
      'projects'
    );

    const {items: boards, excludedItems: excluded_boards} =
      this.verifyListsWithGraphSelection(
        config.boards,
        config.excluded_boards,
        'boards'
      );

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

  // Verifies that inclusion and exclusion lists are not both specified and returns the exclusion list to use.
  protected verifyExclusionList(
    items: ReadonlyArray<string>,
    excludedItems: ReadonlyArray<string>,
    key: 'projects' | 'boards'
  ): ReadonlyArray<string> | undefined {
    if (items?.length && excludedItems?.length) {
      this.logger.warn(
        `Both ${key} and excluded_${key} are specified, excluded_${key} will be ignored.`
      );
      excludedItems = undefined;
    }
    return excludedItems;
  }

  // Verifies that inclusion and exclusion lists are not specified when using Faros Graph for selection, and
  // returns the lists to use.
  protected verifyListsWithGraphSelection(
    items: ReadonlyArray<string>,
    excludedItems: ReadonlyArray<string>,
    key: 'boards' | 'projects' = 'boards'
  ): {items?: ReadonlyArray<string>; excludedItems?: ReadonlyArray<string>} {
    if (!this.useFarosGraphBoardsSelection) {
      excludedItems = this.verifyExclusionList(items, excludedItems, key);
      this.loadedSelectedBoards = true;
    } else {
      if (!this.hasFarosClient()) {
        throw new VError(
          `Faros credentials are required when using Faros Graph for ${key} selection`
        );
      }
      if (items?.length || excludedItems?.length) {
        this.logger.warn(
          `Using Faros Graph for ${key} selection but ${key} and/or excluded_${key} are specified, both will be ignored.`
        );
        items = undefined;
        excludedItems = undefined;
      }
    }
    return {items, excludedItems};
  }

  @Memoize()
  async getProjects(): Promise<ReadonlyArray<ProjectOrBoardInclusion>> {
    if (!this.projects) {
      this.logger.info('Generating list of projects to sync');
      this.projects = new Map();

      const jira = await Jira.instance(this.config, this.logger);
      if (!this.filterConfig.projects?.size) {
        const projects =
          this.isWebhookSupplementMode && this.hasFarosClient()
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

    const allProjects = Array.from(this.projects.values());

    // Apply bucketing filter if configured
    if (!this.config.bucketing) {
      return allProjects;
    }

    return this.config.bucketing.filter(allProjects, ({uid}) => uid);
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
      if (included) {
        const projectKey = toUpper(project);
        this.projects.set(projectKey, {uid: projectKey, issueSync});
      }
    }
  }

  @Memoize()
  async getBoards(): Promise<ReadonlyArray<ProjectOrBoardInclusion>> {
    if (!this.boards) {
      this.logger.info('Generating list of boards to sync.');
      this.boards = new Map();

      const jira = await Jira.instance(this.config, this.logger);

      // Ensure projects is populated
      await this.getProjects();

      // Ensure included / excluded boards are loaded
      await this.loadSelectedBoards();

      if (this.isWebhookSupplementMode && this.hasFarosClient()) {
        await this.getBoardsFromFaros(jira);
      } else {
        await this.getBoardsFromJira(jira);
      }
      this.logger.info(`Will sync ${this.boards.size} boards.`);
      this.logger.debug(
        `Boards to sync: ${Array.from(this.boards.keys()).join(', ')}`
      );
    }
    return Array.from(this.boards.values());
  }

  async getProjectInclusion(project: string): Promise<{
    included: boolean;
    issueSync: boolean;
  }> {
    return {included: true, issueSync: true};
  }

  async getBoardInclusion(board: string): Promise<{
    included: boolean;
    issueSync: boolean;
  }> {
    await this.loadSelectedBoards();
    return this.getInclusion(
      board,
      this.filterConfig.boards,
      this.filterConfig.excludedBoards
    );
  }

  /**
   * Determines whether an item (e.g., a board or a project) should be included in the sync.
   * 1. When using Faros Graph, all items are included in their stream (boards or projects streams), but
   *    only those explicitly included in the Faros Graph are synced.
   * 2. When not using Faros Graph, an item is included if it is in the
   *    `includedSet` or not in the `excludedSet`.
   *
   * @param item - The unique identifier of the item (board or project).
   * @param includedSet - A set of explicitly included items (if applicable).
   * @param excludedSet - A set of explicitly excluded items (if applicable).
   * @returns An object containing:
   *   - included: Whether the item should be included in the sync.
   *   - issueSync: Whether issues related to this item should be synced.
   */
  protected async getInclusion(
    item: string,
    includedSet?: Set<string>,
    excludedSet?: Set<string>
  ): Promise<{included: boolean; issueSync: boolean}> {
    if (this.useFarosGraphBoardsSelection) {
      const included = true;
      const issueSync =
        (!includedSet?.size || includedSet.has(item)) &&
        !excludedSet?.has(item);
      return {included, issueSync};
    }

    if (includedSet?.size) {
      const included = includedSet.has(item);
      return {included, issueSync: included};
    }

    if (excludedSet?.size) {
      const included = !excludedSet.has(item);
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
    await this.loadItemsBasedOnInclusion('boards', 'excludedBoards');
    this.loadedSelectedBoards = true;
  }

  protected async loadItemsBasedOnInclusion(
    includedSetKey: 'boards' | 'projects',
    excludedSetKey: 'excludedBoards' | 'excludedProjects'
  ): Promise<void> {
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
      const {included: items} = farosOptions;
      let {excluded: excludedItems} = farosOptions;
      if (items?.size && excludedItems?.size) {
        this.logger.warn(
          `FarosGraph detected both included and excluded ${includedSetKey}, excluded ${includedSetKey} will be ignored.`
        );
        excludedItems = undefined;
      }
      this.filterConfig[includedSetKey] = items.size ? items : undefined;
      this.filterConfig[excludedSetKey] = excludedItems?.size
        ? excludedItems
        : undefined;
    }
  }

  protected hasFarosClient(): boolean {
    return Boolean(this.farosClient);
  }
}
