import axios, {
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
} from 'axios';
import {AirbyteLogger, wrapApiError} from 'faros-airbyte-cdk';
import https from 'https';
import {Memoize} from 'typescript-memoize';
import {VError} from 'verror';

import {Job, Pipeline, Project, Workflow} from './typings';

const DEFAULT_API_URL = 'https://circleci.com/api/v2';
const DEFAULT_MAX_RETRIES = 3;

export interface CircleCIConfig {
  readonly token: string;
  readonly project_names: ReadonlyArray<string>;
  readonly reject_unauthorized: boolean;
  readonly cutoff_days: number;
  readonly url?: string;
  readonly max_retries?: number;
}

export class CircleCI {
  private static circleCI: CircleCI = undefined;

  constructor(
    private readonly logger: AirbyteLogger,
    readonly axios: AxiosInstance,
    readonly startDate: Date,
    private readonly maxRetries: number
  ) {}

  static instance(config: CircleCIConfig, logger: AirbyteLogger): CircleCI {
    if (CircleCI.circleCI) return CircleCI.circleCI;

    if (!config.token) {
      throw new VError('No token provided');
    }
    if (!config.project_names || config.project_names.length == 0) {
      throw new VError('No project names provided');
    }
    if (!config.cutoff_days) {
      throw new VError('cutoff_days is null or empty');
    }
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - config.cutoff_days);

    const rejectUnauthorized = config.reject_unauthorized ?? true;
    const url = config.url ?? DEFAULT_API_URL;

    CircleCI.circleCI = new CircleCI(
      logger,
      axios.create({
        baseURL: url,
        headers: {
          accept: 'application/json',
          'Circle-Token': config.token,
        },
        httpsAgent: new https.Agent({rejectUnauthorized}),
      }),
      startDate,
      config.max_retries ?? DEFAULT_MAX_RETRIES
    );
    return CircleCI.circleCI;
  }

  async checkConnection(config: CircleCIConfig): Promise<void> {
    try {
      await this.axios.get(`/project/${config.project_names[0]}`);
    } catch (error) {
      if (
        (error as AxiosError).response &&
        (error as AxiosError).response.status === 401
      ) {
        throw new VError(
          'CircleCI authorization failed. Try changing your app api token'
        );
      }

      throw new VError(
        `CircleCI API request failed: ${(error as Error).message}`
      );
    }
  }

  private async iterate<V>(
    requester: (params: any | undefined) => Promise<AxiosResponse<any>>,
    deserializer?: (item: any) => V,
    stopper?: (item: V) => boolean
  ): Promise<V[]> {
    const list = [];
    let pageToken = undefined;
    let getNextPage = true;
    do {
      const res = await requester({'page-token': pageToken});
      if (res.status === 404) {
        return list;
      }

      const items = Array.isArray(res) ? res : res.data?.items;
      for (const item of items ?? []) {
        const data = deserializer ? deserializer(item) : item;
        if (stopper && stopper(data)) {
          getNextPage = false;
          break;
        }
        list.push(data);
      }
      pageToken = res.data.next_page_token;
    } while (getNextPage && pageToken);
    return list;
  }

  private async maybeSleepOnResponse<T = any>(
    path: string,
    res?: AxiosResponse<T>
  ): Promise<boolean> {
    const retryAfterSecs = res?.headers?.['retry-after'];
    if (retryAfterSecs) {
      this.logger.warn(
        `'Retry-After' response header is detected when requesting ${path}. ` +
          `Waiting for ${retryAfterSecs} seconds before making any requests. `
      );
      await this.sleep(Number.parseInt(retryAfterSecs) * 1000);
      return true;
    }
    return false;
  }

  private sleep(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  private async get<T = any, D = any>(
    path: string,
    conf: AxiosRequestConfig<D> = {},
    attempt = 1
  ): Promise<AxiosResponse<T> | undefined> {
    try {
      const res = await this.axios.get<T, AxiosResponse<T>>(path, conf);
      await this.maybeSleepOnResponse(path, res);
      return res;
    } catch (err: any) {
      if (err?.response?.status === 429 && attempt <= this.maxRetries) {
        this.logger.warn(
          `Request to ${path} was rate limited. Retrying... ` +
            `(attempt ${attempt} of ${this.maxRetries})`
        );
        await this.maybeSleepOnResponse(path, err?.response);
        return await this.get(path, conf, attempt + 1);
      }
      throw wrapApiError(err, `Failed to get ${path}. `);
    }
  }

  @Memoize()
  async fetchProject(projectName: string): Promise<Project> {
    return (await this.get(`/project/${projectName}`)).data;
  }

  @Memoize()
  async fetchPipelines(projectName: string): Promise<Pipeline[]> {
    const url = `/project/${projectName}/pipeline`;
    const pipelines = await this.iterate<Pipeline>((params) =>
      this.get(url, {params})
    );
    return pipelines;
  }

  async fetchWorkflows(
    pipelineId: string,
    since?: string
  ): Promise<Workflow[]> {
    const lastStoppedAt = since ? new Date(since) : this.startDate;
    this.logger.info(
      `Fetching completed workflows for pipeline ${pipelineId}` +
        ` since ${lastStoppedAt}`
    );
    const url = `/pipeline/${pipelineId}/workflow`;
    const workflows = await this.iterate(
      (params) =>
        this.get(url, {params, validateStatus: validateNotFoundStatus}),
      (item: any) => item,
      (item: Workflow) =>
        item.stopped_at && lastStoppedAt >= new Date(item.stopped_at)
    );
    for (const workflow of workflows) {
      workflow.jobs = await this.fetchJobs(workflow.id);
    }
    return workflows;
  }

  async fetchJobs(workflowId: string): Promise<Job[]> {
    return this.iterate(
      (params) =>
        this.get(`/workflow/${workflowId}/job`, {
          params,
          validateStatus: validateNotFoundStatus,
        }),
      (item: any) => item
    );
  }
}

// CircleCi API returns 404 if no workflows or jobs exist for a given pipeline
function validateNotFoundStatus(status: number): boolean {
  return status === 200 || status === 404;
}
