import axios, {AxiosInstance} from 'axios';
import {AirbyteLogger} from 'faros-airbyte-cdk';
import {wrapApiError} from 'faros-feeds-sdk';
import {Memoize} from 'typescript-memoize';
import {VError} from 'verror';

import {Comment, Issue, Project, User, VersionMilestone} from './models';

const DEFAULT_VERSION = 'v2';
const DEFAULT_UNIX = -8640000000000000;

export interface BacklogConfig {
  readonly apiKey: string;
  readonly space: string;
  readonly version?: string;
  readonly project_id: number | null;
}

export class Backlog {
  private static backlog: Backlog = null;
  private readonly cfg: BacklogConfig;
  constructor(private readonly httpClient: AxiosInstance, cfg: BacklogConfig) {
    this.cfg = cfg;
  }
  static async instance(
    config: BacklogConfig,
    logger: AirbyteLogger
  ): Promise<Backlog> {
    if (Backlog.backlog) return Backlog.backlog;

    if (!config.apiKey) {
      throw new VError('apiKey must be a not empty string');
    }
    const version = config.version ? config.version : DEFAULT_VERSION;
    const httpClient = axios.create({
      baseURL: `https://${config.space}.backlog.com/api/${version}`,
      timeout: 5000,
      params: {
        apiKey: config.apiKey,
      },
    });

    Backlog.backlog = new Backlog(httpClient, config);
    logger.debug('Created Backlog instance');
    return Backlog.backlog;
  }

  async checkConnection(): Promise<void> {
    try {
      const iter = this.getProjects();
      await iter.next();
    } catch (err: any) {
      let errorMessage = 'Please verify your apiKey are correct. Error: ';
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

  async *getProjects(): AsyncGenerator<Project> {
    const res = await this.httpClient.get<Project[]>('projects');
    for (const item of res.data) {
      const versionMilestone = await this.httpClient.get<VersionMilestone[]>(
        `projects/${item.id}/versions`
      );
      item.versionMilestones = versionMilestone.data;
      yield item;
    }
  }

  @Memoize((lastUpdatedAt?: string) => new Date(lastUpdatedAt ?? DEFAULT_UNIX))
  async *getIssues(lastUpdatedAt?: string): AsyncGenerator<Issue> {
    const startTime = new Date(lastUpdatedAt ?? 0);
    const res = await this.httpClient.get<Issue[]>(
      'issues',
      this.cfg.project_id
        ? {
            params: {
              'projectId[]': this.cfg.project_id,
            },
          }
        : {}
    );
    for (const item of res.data) {
      if (!lastUpdatedAt || new Date(item.updated) >= startTime) {
        const comment = await this.httpClient.get<Comment[]>(
          `issues/${item.id}/comments`
        );
        item.comments = comment.data;
        yield item;
      }
    }
  }

  async *getUsers(): AsyncGenerator<User> {
    const res = await this.httpClient.get<User[]>('users');
    for (const item of res.data) {
      yield item;
    }
  }
}
