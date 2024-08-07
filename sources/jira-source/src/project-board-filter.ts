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
      if (!this.config.projects?.length) {
        const projects = this.supportsFarosClient()
          ? jira.getProjectsFromGraph(
              this.farosClient,
              this.config.graph ?? DEFAULT_GRAPH
            )
          : await jira.getProjects();
        for await (const project of projects) {
          if (!this.config.excluded_projects?.includes(project.key)) {
            this.projects.add(project.key);
          }
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

      if (this.supportsFarosClient()) {
        await this.getBoardsFromFaros(jira);
      } else {
        await this.getBoardsFromJira(jira);
      }
    }
    return Array.from(this.boards);
  }

  boardIsIncluded(board: string): boolean {
    const {boards, excluded_boards} = this.config;
    if (boards?.length) {
      return boards.includes(board);
    }
    if (excluded_boards?.length) {
      return !excluded_boards.includes(board);
    }
    return true;
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

  private supportsFarosClient(): boolean {
    return (
      this.config.run_mode === RunMode.WebhookSupplement && !!this.farosClient
    );
  }
}
