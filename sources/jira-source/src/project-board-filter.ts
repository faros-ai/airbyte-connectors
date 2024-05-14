import {AirbyteLogger} from 'faros-airbyte-cdk';
import {FarosClient} from 'faros-js-client';
import {toUpper} from 'lodash';
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
        const projects = this.supportsFarosClient()
          ? jira.getProjectsFromGraph(
              this.farosClient,
              this.config.graph ?? DEFAULT_GRAPH
            )
          : jira.getProjects();
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
      if (!this.config.boards) {
        const boards = this.supportsFarosClient()
          ? jira.getBoardsFromGraph(
              this.farosClient,
              this.config.graph ?? DEFAULT_GRAPH
            )
          : jira.getBoards();
        for await (const board of boards) {
          await this.maybeIncludeBoard(board.id.toString());
        }
      } else {
        for (const board of this.config.boards) {
          if (await jira.isBoardInBucket(board)) {
            await this.maybeIncludeBoard(board);
          }
        }
      }
    }
    return Array.from(this.boards);
  }

  private async maybeIncludeBoard(boardId: string): Promise<void> {
    const jira = await Jira.instance(this.config, this.logger);
    const boardConfig = await jira.getBoardConfiguration(boardId);
    // Jira Agile API GetConfiguration response type does not include key property
    const projectKey = (boardConfig.location as any)?.key;
    if (!projectKey) {
      this.logger.warn(`No project key found for board ${boardId}`);
      return;
    }

    // Ensure projects is populated
    await this.getProjects();

    if (this.projects.has(projectKey)) {
      this.boards.add(boardId);
    }
  }

  private supportsFarosClient(): boolean {
    return (
      this.config.run_mode === RunMode.WebhookSupplement && !!this.farosClient
    );
  }
}
