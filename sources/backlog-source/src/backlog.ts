import axios, {AxiosInstance} from 'axios';
import {AirbyteLogger, wrapApiError} from 'faros-airbyte-cdk';
import {Memoize} from 'typescript-memoize';
import {VError} from 'verror';

import {Comment, Issue, Project, User, VersionMilestone} from './models';

const DEFAULT_MEMOIZE_START_TIME = 0;

export interface BacklogConfig {
  readonly apiKey: string;
  readonly space: string;
  readonly cutoff_days: number;
  readonly version?: string;
  readonly project_id: number | null;
}

export class Backlog {
  private static backlog: Backlog = null;
  private readonly cfg: BacklogConfig;

  constructor(
    private readonly httpClient: AxiosInstance,
    cfg: BacklogConfig,
    readonly startDate: Date
  ) {
    this.cfg = cfg;
  }
  static async instance(
    config: BacklogConfig,
    logger: AirbyteLogger
  ): Promise<Backlog> {
    if (Backlog.backlog) return Backlog.backlog;

    if (!config.apiKey) {
      throw new VError('No API key provided');
    }
    if (!config.cutoff_days) {
      throw new VError('cutoff_days is null or empty');
    }

    const httpClient = axios.create({
      baseURL: `https://${config.space}.backlog.com/api/v2`,
      timeout: 5000,
      params: {
        apiKey: config.apiKey,
      },
    });
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - config.cutoff_days);
    Backlog.backlog = new Backlog(httpClient, config, startDate);
    return Backlog.backlog;
  }

  async checkConnection(): Promise<void> {
    try {
      const iter = this.getProjects();
      await iter.next();
    } catch (err: any) {
      let errorMessage = 'Could not verify API key. Error: ';
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

      if (versionMilestone.status === 200)
        item.versionMilestones = versionMilestone.data;

      yield item;
    }
  }

  @Memoize(
    (lastUpdatedAt?: string) =>
      new Date(lastUpdatedAt ?? DEFAULT_MEMOIZE_START_TIME)
  )
  async getIssues(lastUpdatedAt?: string): Promise<ReadonlyArray<Issue>> {
    const results: Issue[] = [];
    const startTime = new Date(lastUpdatedAt ?? 0);
    const startTimeMax =
      startTime > this.startDate ? startTime : this.startDate;
    const config = this.cfg.project_id
      ? {
          params: {
            'projectId[]': this.cfg.project_id,
            updatedSince: lastUpdatedAt ? this.formatDate(startTimeMax) : '',
          },
        }
      : {
          params: {
            updatedSince: lastUpdatedAt ? this.formatDate(startTimeMax) : '',
          },
        };
    const res = await this.httpClient.get<Issue[]>('issues', config);
    for (const item of res.data) {
      if (!lastUpdatedAt || new Date(item.updated) >= startTimeMax) {
        const comment = await this.httpClient.get<Comment[]>(
          `issues/${item.id}/comments`
        );

        if (comment.status === 200) item.comments = comment.data;

        results.push(item);
      }
    }
    return results;
  }

  formatDate(d: Date): string {
    let month = '' + (d.getMonth() + 1);
    let day = '' + d.getDate();
    const year = d.getFullYear();
    if (month.length < 2) month = '0' + month;
    if (day.length < 2) day = '0' + day;
    return [year, month, day].join('-');
  }

  async *getUsers(): AsyncGenerator<User> {
    const res = await this.httpClient.get<User[]>('users');
    for (const item of res.data) {
      yield item;
    }
  }
}
