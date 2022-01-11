import axios from 'axios';
import Client, {
  Epic,
  Iteration,
  Member,
  Project,
  Repository,
  Story,
  StoryLink,
} from 'clubhouse-lib';
export {Epic, Iteration, Member, Project, Repository};
import {Utils, wrapApiError} from 'faros-feeds-sdk';
import {Memoize} from 'typescript-memoize';
import {VError} from 'verror';
export interface ShortcutConfig {
  readonly token: string;
  readonly base_url: string;
  readonly version: string;
  readonly project_public_id: number | null;
}

export interface ExtendStory extends Story {
  readonly story_links: Array<StoryLink>;
}
const DEFAULT_UNIX = -8640000000000000;
const DEFAULT_ITERATIONS_START_DATE = new Date(DEFAULT_UNIX);
const DEFAULT_STORIES_START_DATE = new Date(DEFAULT_UNIX);
const DEFAULT_STORIES_END_DATE = new Date();
const DEFAULT_BASE_URL = 'https://api.app.shortcut.com';
const DEFAULT_VERSION = 'v3';
export class Shortcut {
  private static shortcut: Shortcut = null;
  private readonly cfg: ShortcutConfig;
  private readonly baseUrl: string;
  private readonly version: string;
  private readonly client: Client<RequestInfo, Response>;
  constructor(cfg: ShortcutConfig) {
    this.cfg = cfg;
    this.baseUrl = cfg.base_url ? cfg.base_url : DEFAULT_BASE_URL;
    this.version = cfg.version ? cfg.version : DEFAULT_VERSION;
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

  @Memoize((lastUpdatedAt?: string) => new Date(lastUpdatedAt ?? DEFAULT_UNIX))
  async *getIterations(lastUpdatedAt?: string): AsyncGenerator<Iteration> {
    const startTime =
      new Date(lastUpdatedAt ?? 0) > DEFAULT_ITERATIONS_START_DATE
        ? new Date(lastUpdatedAt)
        : DEFAULT_ITERATIONS_START_DATE;

    const list = await this.client.listIterations();
    for (const item of list) {
      const updatedAt = new Date(item.updated_at);
      if (updatedAt >= startTime) {
        yield item;
      }
    }
  }

  async *getEpics(projectId: number): AsyncGenerator<Epic> {
    const epics = await this.client.listEpics();
    for (const epic of epics) {
      if (!epic.project_ids?.length || !epic.updated_at) {
        continue;
      }
      // Epic belongs to at least one project id,
      // the endpoint doesn't support filtering, so we have to do it on the client side
      if (!epic.project_ids.find((x) => projectId == x)) {
        continue;
      }
      yield epic;
    }
  }

  async *getStories(updateRange?: [Date, Date]): AsyncGenerator<ExtendStory> {
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
  ): AsyncGenerator<ExtendStory> {
    const [from, to] = updateRange;
    const method = 'GET';
    const path = `/api/${this.version}/search/stories?query=project:${projectPublicId}`;
    const url = `${this.baseUrl}${path}`;
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
          const storyItem = item as ExtendStory;
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
}
