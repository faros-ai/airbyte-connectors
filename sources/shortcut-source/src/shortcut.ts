import axios from 'axios';
import Client, {
  Epic,
  ID,
  Iteration,
  Label,
  Member,
  Project,
  PullRequest,
  Repository,
  StoryLink,
  Task,
} from 'clubhouse-lib';
export {Epic, Iteration, Member, Project, Repository};
import {Utils, wrapApiError} from 'faros-feeds-sdk';
import {VError} from 'verror';

export interface ShortcutConfig {
  readonly token: string;
  readonly base_url: string;
  readonly version: string;
  readonly project_public_id: number | null;
}

export declare type StoryType = 'bug' | 'chore' | 'feature';
export interface Story {
  readonly app_url: string;
  readonly archived: boolean;
  readonly blocked: boolean;
  readonly blocker: boolean;
  readonly comments: Array<Comment>;
  readonly completed: boolean;
  readonly completed_at: string | null;
  readonly completed_at_override: string | null;
  readonly created_at: string;
  readonly cycle_time: number;
  readonly deadline: string | null;
  readonly description: string;
  readonly entity_type: string;
  readonly epic_id: number | null;
  readonly estimate: number | null;
  readonly external_id: string | null;
  readonly external_links: Array<string>;
  readonly files: Array<File>;
  readonly follower_ids: Array<ID>;
  readonly id: number;
  readonly iteration_id: number | null;
  readonly labels: Array<Label>;
  readonly lead_time: number;
  readonly member_mention_ids: Array<ID>;
  readonly mention_ids: Array<ID>;
  readonly moved_at: string | null;
  readonly name: string;
  readonly owner_ids: Array<ID>;
  readonly position: number;
  readonly previous_iteration_ids: Array<number>;
  readonly project_id: number;
  readonly requested_by_id: ID;
  readonly started: boolean;
  readonly started_at: string | null;
  readonly started_at_override: string | null;
  readonly story_links: Array<StoryLink>;
  readonly story_type: StoryType;
  readonly tasks: Array<Task>;
  readonly task_ids: Array<number>;
  readonly updated_at: string | null;
  readonly workflow_state_id: number;
  readonly pull_requests: Array<PullRequest>;
}

const DEFAULT_STORIES_START_DATE = new Date(-8640000000000000);
const DEFAULT_STORIES_END_DATE = new Date();

export class Shortcut {
  private static shortcut: Shortcut = null;
  private readonly cfg: ShortcutConfig;
  private readonly client: Client<RequestInfo, Response>;
  constructor(cfg: ShortcutConfig) {
    this.cfg = cfg;
    this.client = Client.create(cfg.token);
  }

  static async instance(config: ShortcutConfig): Promise<Shortcut> {
    if (Shortcut.shortcut) return Shortcut.shortcut;

    if (!config.token) {
      throw new VError('token must be a not empty string');
    }
    Shortcut.shortcut = new Shortcut(config);
    return Shortcut.shortcut;
  }

  async checkConnection(): Promise<void> {
    try {
      await this.client.listProjects();
    } catch (err: any) {
      let errorMessage = 'Please verify your token are correct. Error: ';
      if (err.error_code || err.error_info) {
        errorMessage += `${err.error_code}: ${err.error_info}`;
        throw new VError(errorMessage);
      }
      try {
        errorMessage += err.message ?? err.statusText ?? wrapApiError(err);
      } catch (wrapError: any) {
        errorMessage += wrapError.message;
      }
      throw new VError(errorMessage);
    }
  }

  async *getProjects(
    projectIds?: ReadonlyArray<number>
  ): AsyncGenerator<Project> {
    const projects = await this.client.listProjects();
    const filterProject = projects.filter(
      (p) => !projectIds || projectIds.includes(p.id)
    );
    for (const item of filterProject) {
      yield item;
    }
  }

  async *getIterations(): AsyncGenerator<Iteration> {
    const list = await this.client.listIterations();
    for (const item of list) {
      yield item;
    }
  }

  async *getEpics(projectIds: ReadonlyArray<number>): AsyncGenerator<Epic> {
    const epics = await this.client.listEpics();
    for (const epic of epics) {
      if (!epic.project_ids?.length || !epic.updated_at) {
        continue;
      }
      // Epic belongs to at least one project id,
      // the endpoint doesn't support filtering, so we have to do it on the client side
      if (!epic.project_ids.find((x) => projectIds.includes(x))) {
        continue;
      }
      yield epic;
    }
  }

  async *getStories(updateRange?: [Date, Date]): AsyncGenerator<Story> {
    let updateRangeUndefined = true;
    if (!updateRange) {
      updateRangeUndefined = false;
      updateRange = [DEFAULT_STORIES_START_DATE, DEFAULT_STORIES_END_DATE];
    }
    const [from, to] = updateRange;
    if (this.cfg.project_public_id) {
      yield* this.getStorieByProjectId(
        this.cfg.project_public_id,
        updateRangeUndefined,
        updateRange
      );
    } else {
      const iterProjects = this.getProjects();
      const method = 'GET';
      for await (const item of iterProjects) {
        yield* this.getStorieByProjectId(
          item.id,
          updateRangeUndefined,
          updateRange
        );
      }
    }
  }

  async *getStorieByProjectId(
    projectPublicId: number,
    updateRangeUndefined: boolean,
    updateRange?: [Date, Date]
  ): AsyncGenerator<Story> {
    const [from, to] = updateRange;
    const method = 'GET';
    let path = `/api/v3/search/stories?query=project:${projectPublicId}`;
    if (this.cfg.version) {
      path = `/api/${this.cfg.version}/search/stories?query=project:${projectPublicId}`;
    }
    let url = `https://api.app.shortcut.com${path}`;
    if (this.cfg.base_url) {
      url = `${this.cfg.base_url}${path}`;
    }
    try {
      const res = await axios.request({
        method,
        url,
        headers: {
          'Content-Type': 'application/json',
          'Shortcut-Token': this.cfg.token,
        },
      });
      if (res.status === 200) {
        for (const item of res.data.data) {
          const storyItem = item as Story;
          if (!storyItem.updated_at) {
            if (updateRangeUndefined) {
              yield storyItem;
            }
          } else {
            const updatedAt = Utils.toDate(storyItem.updated_at);
            if (updatedAt && updatedAt >= from && updatedAt < to) {
              yield storyItem;
            }
          }
        }
      } else {
        throw new VError(
          'Request to %s failed. Unexpected response: %s - %s',
          url,
          res.status,
          JSON.stringify(res.data)
        );
      }
    } catch (err) {
      throw new VError('Request to %s %s failed: %s', method, url);
    }
  }

  async *getMembers(): AsyncGenerator<Member> {
    const list = await this.client.listMembers();
    for (const item of list) {
      yield item;
    }
  }

  async *getRepositories(): AsyncGenerator<Repository> {
    const list = await this.client.listResource('repositories');
    for (const item of list) {
      yield item as Repository;
    }
  }
}
