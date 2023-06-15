import axios, {AxiosInstance, AxiosResponse} from 'axios';
import axiosRetry, {IAxiosRetryConfig} from 'axios-retry';
import {AirbyteLogger, wrapApiError} from 'faros-airbyte-cdk';
import VError from 'verror';

import {TimeWindow} from '../models';
import {
  Case,
  CaseType,
  PagedCases,
  PagedProjects,
  PagedResponse,
  PagedRuns,
  Project,
  Run,
  Suite,
} from './models';

const DEFAULT_PAGE_SIZE = 250;
const DEFAULT_TIMEOUT = 30_000;
const DEFAULT_MAX_RETRIES = 3;

export interface TestRailsClientConfig {
  readonly username: string;
  readonly apiKey: string;
  readonly instanceUrl: string;
  readonly pageSize?: number;
  readonly timeout?: number;
  readonly maxRetries?: number;
  readonly logger?: AirbyteLogger;
}

export class TestRailsClient {
  private readonly api: AxiosInstance;
  private readonly pageSize: number;
  private readonly logger?: AirbyteLogger;

  constructor(config: TestRailsClientConfig) {
    this.logger = config.logger;
    this.pageSize = config.pageSize ?? DEFAULT_PAGE_SIZE;

    const cleanInstanceUrl = config.instanceUrl.replace(/\/$/, '');

    this.api = axios.create({
      baseURL: `${cleanInstanceUrl}/index.php?/api/v2`,
      auth: {
        username: config.username,
        password: config.apiKey,
      },
      timeout: config.timeout ?? DEFAULT_TIMEOUT,
      maxContentLength: Infinity,
    });

    const retries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    if (retries > 0) {
      const retryConfig: IAxiosRetryConfig = {
        retryDelay: axiosRetry.exponentialDelay,
        shouldResetTimeout: true,
        retries,
        onRetry: (retryCount, error, requestConfig) => {
          this.logger?.info(
            `Retrying request ${requestConfig.url} due to an error: ${error.message} ` +
              `(attempt ${retryCount} of ${retries})`
          );
        },
      };
      axiosRetry(this.api, retryConfig);
    }
  }

  async *getProjects(): AsyncGenerator<Project> {
    const projects = (res: PagedProjects): Project[] => {
      return res.projects;
    };

    yield* this.paginate<Project, PagedProjects>('/get_projects', projects);
  }

  async getSuites(projectId: number): Promise<Suite[]> {
    return this.get<Suite[]>(`/get_suites/${projectId}`);
  }

  async *getCases(
    projectId: string,
    window?: TimeWindow
  ): AsyncGenerator<Case> {
    let window_params = '';
    if (window.after) {
      window_params += `&updated_after=${window.after.toUnixInteger()}`;
    }
    if (window.before) {
      window_params += `&updated_before=${window.before.toUnixInteger()}`;
    }

    const path = '/get_cases/' + projectId + window_params;
    const cases = (res: PagedCases): Case[] => {
      return res.cases;
    };

    yield* this.paginate<Case, PagedCases>(path, cases);
  }

  async getCaseTypes(): Promise<CaseType[]> {
    return this.get<CaseType[]>('/get_cases_types');
  }

  // TODO: Might not pull things that are part of test plans
  async *getRuns(projectId: number, window: TimeWindow): AsyncGenerator<Run> {
    let window_params = '';
    if (window.after) {
      window_params += `&created_after=${window.after.toUnixInteger()}`;
    }
    if (window.before) {
      window_params += `&created_before=${window.before.toUnixInteger()}`;
    }

    const path = '/get_runs/' + projectId + window_params;
    const runs = (res: PagedRuns): Run[] => {
      return res.runs;
    };

    yield* this.paginate(path, runs);
  }

  private async *paginate<T, R extends PagedResponse>(
    path: string,
    getItems: (res: R) => T[]
  ): AsyncGenerator<T> {
    const limit = this.pageSize;
    let offset = 0;
    let hasNext = true;
    while (hasNext) {
      // TestRails uses a non-standard '&' query param starter
      const page_params = `&limit=${limit}&offset=${offset}`;
      const request = this.api.get<R>(path + page_params);
      const response = await this.wrapRequest(request);

      for (const item of getItems(response)) {
        yield item;
      }

      offset += limit;
      hasNext = limit == response.size;
    }
  }

  private get<T>(path: string): Promise<T> {
    return this.wrapRequest(this.api.get(path));
  }

  private async wrapRequest<T>(request: Promise<AxiosResponse<T>>): Promise<T> {
    try {
      const {data} = await request;
      return data;
    } catch (err: any) {
      const errorMessage = wrapApiError(err).message;
      throw new VError(errorMessage);
    }
  }
}
