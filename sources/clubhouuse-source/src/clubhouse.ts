import axios, {Method} from 'axios';
import Client, {
  Epic,
  ID,
  Iteration,
  Label,
  Member,
  Project,
  PullRequest,
  StoryLink,
  Task,
} from 'clubhouse-lib';
import {Utils, wrapApiError} from 'faros-feeds-sdk';
import https from 'https';
import moment from 'moment';
import {VError} from 'verror';

export interface ClubhouseConfig {
  readonly token: string;
  readonly baseUrl: string;
  readonly version: string;
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

export interface Repository {
  created_ad: string;
  entity_type: string;
  external_id?: string | null;
  full_name: string;
  id: number;
  name: string;
  type: string;
  updated_at: string | null;
  url: string;
}
export class Clubhouse {
  private readonly cfg: ClubhouseConfig;
  private readonly client: Client<RequestInfo, Response>;
  constructor(cfg: ClubhouseConfig) {
    this.cfg = cfg;
    this.client = Client.create(cfg.token);
  }

  private async request<T>(
    path: string,
    params?: any,
    payload?: any,
    method: Method = 'GET'
  ): Promise<T> {
    const url = `${this.cfg.baseUrl}${path}`;
    const httpsAgent = new https.Agent();
    try {
      const res = await axios.request({
        method,
        url,
        headers: {
          'Content-Type': 'application/json',
          'Clubhouse-Token': this.cfg.token,
        },
        params,
        data: payload,
        httpsAgent,
      });

      if (res.status !== 200) {
        throw new VError(
          'Request to %s failed. Unexpected response: %s - %s',
          url,
          res.status,
          JSON.stringify(res.data)
        );
      }

      return res.data;
    } catch (err) {
      throw new VError('Request to %s %s failed: %s', method, url);
    }
  }

  private static async *iterate<V>(
    requester: (url: string | undefined) => Promise<any>,
    filter: (item: V) => boolean
  ): AsyncGenerator<V> {
    let next = '';
    do {
      const res = await requester(next);
      const items = Array.isArray(res) ? res : res.data;
      for (const item of items) {
        if (filter(item)) yield item;
      }
      next = res.next;
    } while (next);
  }

  private static updatedBetweenQuery(range: [Date, Date]): string {
    const [from, to] = range;
    if (to < from) {
      throw new VError(
        `invalid update range: end timestamp '${to}' ` +
          `is strictly less than start timestamp '${from}'`
      );
    }
    const fromStr = moment.utc(from).format('YYYY-MM-DD');
    const toStr = moment.utc(to).format('YYYY-MM-DD');
    return `updated:${fromStr}..${toStr}`;
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
  async *getStories(updateRange: [Date, Date]): AsyncGenerator<Story> {
    const iterProjects = this.getProjects();
    const [from, to] = updateRange;
    const rangeQuery = Clubhouse.updatedBetweenQuery(updateRange);
    for await (const item of iterProjects) {
      return Clubhouse.iterate<Story>(
        (url) =>
          this.request(
            url ||
              `/api/${this.cfg.version}/search/stories?query=project:${item.id} ${rangeQuery}`
          ),
        (item) => {
          // We apply additional filtering since Clubhouse API
          // only supports filtering by dates, e.g YYYY-MM-DD
          if (!item.updated_at) return false;
          const updatedAt = Utils.toDate(item.updated_at);
          return updatedAt && updatedAt >= from && updatedAt < to;
        }
      );
    }
    yield null;
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
