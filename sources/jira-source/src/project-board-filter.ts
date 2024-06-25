import {AirbyteLogger} from 'faros-airbyte-cdk';
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
      if (!this.config.projects_included) {
        const projects = this.supportsFarosClient()
          ? jira.getProjectsFromGraph(
              this.farosClient,
              this.config.graph ?? DEFAULT_GRAPH
            )
          : await jira.getProjects();
        for await (const project of projects) {
          if (!this.config.projects_excluded?.includes(project.key)) {
            this.projects.add(project.key);
          }
        }
      } else {
        if (this.config.projects_excluded) {
          this.logger.info(
            'Both projects_included and projects_excluded are specified, projects_excluded will be ignored.'
          );
        }
        for (const project of this.config.projects_included) {
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

      if (this.config.boards_included && this.config.boards_excluded) {
        this.logger.info(
          'Both boards_included and boards_excluded are specified, boards_excluded will be ignored.'
        );
      }
      if (this.supportsFarosClient()) {
        await this.getBoardsFromFaros(jira);
      } else {
        await this.getBoardsFromJira(jira);
      }
    }
    return Array.from(this.boards);
  }

  private async getBoardsFromJira(jira: Jira): Promise<void> {
    for (const project of this.projects) {
      for (const board of await jira.getBoards(project)) {
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

  private boardIsIncluded(board: string): boolean {
    if (!this.config.boards_included && !this.config.boards_excluded) {
      return true;
    }
    if (this.config.boards_included?.includes(board)) {
      return true;
    }
    return (
      !this.config.boards_included &&
      !this.config.boards_excluded?.includes(board)
    );
  }

  private supportsFarosClient(): boolean {
    return (
      this.config.run_mode === RunMode.WebhookSupplement && !!this.farosClient
    );
  }
}
