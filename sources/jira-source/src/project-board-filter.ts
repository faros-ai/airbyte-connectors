import {AirbyteLogger} from 'faros-airbyte-cdk';
import {BoardsByProject, FarosOptions} from 'faros-feeds-sdk';
import {FarosClient} from 'faros-js-client';
import {toString, toUpper} from 'lodash';
import {Memoize} from 'typescript-memoize';

import {DEFAULT_GRAPH, Jira, JiraConfig} from './jira';
import {RunMode} from './streams/common';

export class ProjectBoardFilter {
  projects: Set<string> | undefined;
  boards: Set<string> | undefined;

  constructor(
    private readonly config: JiraConfig,
    private readonly logger: AirbyteLogger,
    private readonly farosClient?: FarosClient
  ) {}

  @Memoize()
  async getProjects(): Promise<ReadonlyArray<string>> {
    if (!this.projects) {
      this.projects = new Set();

      const jira = await Jira.instance(this.config, this.logger);
      if (!this.config.projects) {
        // Fetch projects written to the graph by Jira Webhook if run_mode is WebhookSupplement
        const projects =
          this.config.run_mode === RunMode.WebhookSupplement
            ? jira.getProjectsFromGraph(
                this.farosClient,
                this.config.graph ?? DEFAULT_GRAPH
              )
            : await jira.getProjects();
        for await (const project of projects) {
          this.projects.add(project.key);
        }
      } else {
        for (const project of this.config.projects) {
          if (jira.isProjectInBucket(project))
            this.projects.add(toUpper(project));
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

      // Fetch projects and boards that are already written to the graph to check board inclusion
      const farosOptions = new FarosOptions(
        this.farosClient,
        this.logger.asPino()
      );
      const farosBoardsByProject: BoardsByProject =
        await farosOptions.fetchBoardsByProject(
          this.config.graph ?? DEFAULT_GRAPH,
          'Jira',
          Array.from(this.projects),
          true
        );

      // If pull_unknown_boards is enabled, and discovery is not skipped, fetch all boards from Jira and
      // add to the set of boards the ones that are not marked as excluded in the graph
      if (
        this.config.pull_unknown_boards &&
        !this.config.skip_board_discovery
      ) {
        this.logger.info(
          'Listing all available boards from Jira as pull_unknown_boards is enabled ' +
            'and discovery is not skipped'
        );
        await this.getBoardsFromJira(jira, farosBoardsByProject);
      } else {
        this.logger.info('Listing boards from Faros graph only');
        await this.getBoardsFromFaros(farosBoardsByProject);
      }
    }
    return Array.from(this.boards);
  }

  private async getBoardsFromJira(
    jira: Jira,
    farosBoardsByProject: BoardsByProject
  ): Promise<void> {
    for await (const project of this.projects) {
      for (const jiraBoard of await jira.getBoards(project)) {
        const boardId = toString(jiraBoard.id);
        const farosProject = farosBoardsByProject[project];
        const board = farosProject?.find((board) => board.uid === boardId);
        if (
          this.boardIsIncludedInFaros(board) &&
          this.boardIsIncludedInConfig(boardId)
        ) {
          this.boards.add(boardId);
        }
      }
    }
  }

  private async getBoardsFromFaros(
    farosBoardsByProject: BoardsByProject
  ): Promise<void> {
    for (const [projectKey, boards] of Object.entries(farosBoardsByProject)) {
      for (const board of boards) {
        if (
          this.boardIsIncludedInFaros(board) &&
          this.boardIsIncludedInConfig(board.uid)
        ) {
          this.boards.add(board.uid);
        }
      }
    }
  }

  // TODO: import board type from faros-feeds-sdk
  private boardIsIncludedInFaros(board?: any): boolean {
    const inclusion = board?.inclusion?.category;
    if (inclusion === 'Excluded') {
      return false;
    }
    return inclusion === 'Included' || this.config.pull_unknown_boards;
  }

  private boardIsIncludedInConfig(board: string): boolean {
    return !this.config.boards || this.config.boards.includes(board);
  }
}
