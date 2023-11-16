import axios, {
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
} from 'axios';
import {AirbyteLogger, wrapApiError} from 'faros-airbyte-cdk';
import https from 'https';
import {maxBy} from 'lodash';
import {Memoize} from 'typescript-memoize';
import {VError} from 'verror';

import {Job, Pipeline, Project, TestMetadata, Workflow} from './typings';

const DEFAULT_API_URL = 'https://circleci.com/api/v2';
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_CUTOFF_DAYS = 90;
const DEFAULT_REQUEST_TIMEOUT = 60000;

export interface CircleCIConfig {
  readonly token: string;
  readonly project_names: ReadonlyArray<string>;
  readonly reject_unauthorized: boolean;
  readonly project_block_list?: ReadonlyArray<string>;
  readonly cutoff_days?: number;
  readonly url?: string;
  readonly request_timeout?: number;
  readonly max_retries?: number;
}

export class CircleCI {
  private static circleCI: CircleCI = undefined;

  constructor(
    private readonly logger: AirbyteLogger,
    readonly axios: AxiosInstance,
    readonly cutoffDays: number,
    private readonly maxRetries: number,
    readonly filtered_project_names: string[]
  ) {}

  static async instance(
    config: CircleCIConfig,
    logger: AirbyteLogger,
    applyBlocklist: boolean = true
  ): Promise<CircleCI> {
    if (CircleCI.circleCI) return CircleCI.circleCI;

    if (!config.token) {
      throw new VError('No token provided');
    }
    if (!config.project_names || config.project_names.length == 0) {
      throw new VError('No project names provided');
    }
    const cutoffDays = config.cutoff_days ?? DEFAULT_CUTOFF_DAYS;

    const rejectUnauthorized = config.reject_unauthorized ?? true;
    const url = config.url ?? DEFAULT_API_URL;
    const axiosInstance: AxiosInstance = axios.create({
      baseURL: url,
      headers: {
        accept: 'application/json',
        'Circle-Token': config.token,
      },
      httpsAgent: new https.Agent({rejectUnauthorized}),
      timeout: config.request_timeout ?? DEFAULT_REQUEST_TIMEOUT,
      // CircleCI responses can be are very large hence the infinity
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });
    throw Error(
      'Make it so only repo names are needed and we add slug to them'
    );
    let filtered_project_names: string[] = Array.from(config.project_names);
    if (config.project_block_list && applyBlocklist) {
      filtered_project_names = await this.updateProjectNamesWithBlocklist(
        config,
        logger,
        axiosInstance
      );
    }

    CircleCI.circleCI = new CircleCI(
      logger,
      axiosInstance,
      cutoffDays,
      config.max_retries ?? DEFAULT_MAX_RETRIES,
      filtered_project_names
    );
    return CircleCI.circleCI;
  }

  static async updateProjectNamesWithBlocklist(
    config: CircleCIConfig,
    logger: AirbyteLogger,
    axiosInstance: AxiosInstance
  ): Promise<string[]> {
    const res: string[] = [];
    if (config.project_names.includes('*')) {
      // project names has the wildcard, which means we need to
      // get all the project names and then remove the projects in the
      // block list
      logger.info(
        'Wildcard Project name found - calling API to get all project names.'
      );
      // ORG SLUG:
      // https://circleci.com/api/v2/me/collaborations
      // Using org slug, projects can be accessed with slug/repo_name
      axiosInstance.get('/project/*');
    } else {
      // In this case the assumption is that they're placing all
      // the projects in the project_names list but also have project names in
      // the block list which they want to avoid
      for (const project_name in config.project_names) {
        if (!config.project_block_list.includes(project_name)) {
          res.push(project_name);
        }
      }
    }
    return res;
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

  async *fetchPipelines(
    projectName: string,
    since?: string
  ): AsyncGenerator<Pipeline> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - this.cutoffDays);

    const lastUpdatedAt = since ? new Date(since) : startDate;
    const gracePeriod = lastUpdatedAt;
    gracePeriod.setDate(gracePeriod.getDate() - this.cutoffDays);

    const url = `/project/${projectName}/pipeline`;
    const pipelines = await this.iterate<Pipeline>(
      (params) => this.get(url, {params}),
      (item: any) => ({
        ...item,
        workflows: [],
      }),
      (item: Pipeline) => new Date(item.updated_at) <= gracePeriod
    );
    for (const pipeline of pipelines) {
      const workflows = await this.fetchWorkflows(pipeline.id, lastUpdatedAt);
      const updatedAt =
        maxBy(
          workflows.map((wf) => wf.stopped_at),
          (timestamp) => new Date(timestamp)
        ) || pipeline.updated_at;

      if (new Date(updatedAt) > lastUpdatedAt) {
        pipeline.computedProperties = {updatedAt};
        pipeline.workflows = workflows;
        for (const workflow of pipeline.workflows) {
          workflow.jobs = await this.fetchJobs(workflow.id);
        }
        yield pipeline;
      }
    }
  }

  @Memoize()
  async fetchWorkflows(pipelineId: string, since: Date): Promise<Workflow[]> {
    const url = `/pipeline/${pipelineId}/workflow`;
    return this.iterate<Workflow>(
      (params) =>
        this.get(url, {params, validateStatus: validateNotFoundStatus}),
      (item: any) => ({
        ...item,
        jobs: [],
      }),
      (item: Workflow) => item.stopped_at && new Date(item.stopped_at) <= since
    );
  }

  @Memoize()
  async fetchJobs(workflowId: string): Promise<Job[]> {
    return this.iterate<Job>(
      (params) =>
        this.get(`/workflow/${workflowId}/job`, {
          params,
          validateStatus: validateNotFoundStatus,
        }),
      (item: any) => item
    );
  }

  async fetchTests(
    projectSlug: string,
    jobNumber: number
  ): Promise<TestMetadata[]> {
    return this.iterate<TestMetadata>(
      (params) =>
        this.get(`/project/${projectSlug}/${jobNumber}/tests`, {
          params,
          validateStatus: validateNotFoundStatus,
        }),
      (item: any) => item
    );
  }
}

// CircleCI API returns 404 if no workflows or jobs exist for a given pipeline
function validateNotFoundStatus(status: number): boolean {
  return status === 200 || status === 404;
}
