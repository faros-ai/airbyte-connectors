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

import {Job, Pipeline, Project, TestMetadata, Workflow} from './types';

const DEFAULT_API_URL = 'https://circleci.com/api/v2';
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_CUTOFF_DAYS = 90;
const DEFAULT_REQUEST_TIMEOUT = 60000;

export interface CircleCIConfig {
  readonly token: string;
  readonly url?: string;
  project_slugs: ReadonlyArray<string>;
  readonly project_blocklist?: string[];
  readonly pull_blocklist_from_graph?: boolean;
  readonly faros_api_url?: string;
  readonly faros_api_key?: string;
  readonly faros_graph_name?: string;
  readonly reject_unauthorized: boolean;
  readonly cutoff_days?: number;
  readonly request_timeout?: number;
  readonly max_retries?: number;
}

export class CircleCI {
  private static circleCI: CircleCI = undefined;

  constructor(
    private readonly logger: AirbyteLogger,
    readonly v1: AxiosInstance,
    readonly v2: AxiosInstance,
    readonly cutoffDays: number,
    private readonly maxRetries: number
  ) {}

  static instance(config: CircleCIConfig, logger: AirbyteLogger): CircleCI {
    if (CircleCI.circleCI) return CircleCI.circleCI;

    if (!config.token) {
      throw new VError('No token provided');
    }
    if (!config.project_slugs || config.project_slugs.length == 0) {
      throw new VError('No project names provided');
    }
    if (config.project_slugs.includes('*') && config.project_slugs.length > 1) {
      throw new VError(
        'If wildcard is included in project slugs, do not include other project slugs'
      );
    }

    const cutoffDays = config.cutoff_days ?? DEFAULT_CUTOFF_DAYS;
    const axios_v1_instance = this.getAxiosInstance(config, logger, 'v1');
    const axios_v2_instance = this.getAxiosInstance(config, logger, 'v2');

    CircleCI.circleCI = new CircleCI(
      logger,
      axios_v1_instance,
      axios_v2_instance,
      cutoffDays,
      config.max_retries ?? DEFAULT_MAX_RETRIES
    );
    return CircleCI.circleCI;
  }

  static getAxiosInstance(
    config: CircleCIConfig,
    logger: AirbyteLogger,
    api_version: string = 'v2',
    params: Record<string, any> = {}
  ): AxiosInstance {
    // In this function we rely on the fact that the  API URL contains 'v{X}' in it,
    // where X is the version number, e.g. "2" or "1.1". We replace the
    // version number with the one we want to use, stored in the param 'api_version'
    let url = config.url ?? DEFAULT_API_URL;
    const versionRegex = /v\d+(\.\d+)?/g;
    url = url.replace(versionRegex, api_version);
    logger.info(`Using API URL (${api_version}): "${url}"`);
    const rejectUnauthorized = config.reject_unauthorized ?? true;
    const axiosInstance: AxiosInstance = axios.create({
      baseURL: url,
      headers: {
        accept: 'application/json',
        'Circle-Token': config.token,
      },
      httpsAgent: new https.Agent({rejectUnauthorized}),
      timeout: config.request_timeout ?? DEFAULT_REQUEST_TIMEOUT,
      // CircleCI responses can be very large hence the infinity
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      params: params,
    });
    return axiosInstance;
  }

  async checkConnection(): Promise<void> {
    try {
      await this.v2.get(`/me`);
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

  async getAllProjects(): Promise<Project[]> {
    // Using org slug, projects can be accessed with slug/repo_name (if not github or gitlab)
    // or circleci/org_id/project_id (if github or gitlab)
    const res = [];
    try {
      this.logger.debug(`Getting all projects from "/api/v1.1/me"`);
      const meRes = await this.get({path: '/me', api: this.v1});
      const projectsData = meRes.data.projects;

      if (!projectsData) {
        throw new Error('Could not retrieve projects from "/api/v1.1/me"');
      }

      const projects = Object.keys(projectsData);
      this.logger.debug(`Retrieved projects from "/api/v1.1/me: ${projects}`);

      for (const project of projects) {
        // Isolate projectId (ex: //circleci.com/85466249-1421-4025-9df7-253efd670dff/26ff2ef9-dd37-41a5-a62a-c129909783d3)
        const projectMatch = project.match(/^.*\/([^/]*)$/);
        if (!projectMatch) {
          this.logger.error(`Could not parse projectId name from "${project}"`);
          continue;
        }
        const projectId = projectMatch[1];
        const projectRes = await this.get({path: `/project/${projectId}`});
        const projectData = projectRes.data;

        res.push(projectData);
      }
    } catch (error: any) {
      throw new Error(
        `Failed to get all projects. Error: ${wrapApiError(error)}`
      );
    }

    return res;
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

  private async get<T = any, D = any>({
    path,
    api = this.v2,
    config = {},
    attempt = 1,
  }: {
    path: string;
    api?: AxiosInstance;
    config?: AxiosRequestConfig<D>;
    attempt?: number;
  }): Promise<AxiosResponse<T> | undefined> {
    try {
      const res = await api.get<T, AxiosResponse<T>>(path, config);
      await this.maybeSleepOnResponse(path, res);
      return res;
    } catch (err: any) {
      if (err?.response?.status === 429 && attempt <= this.maxRetries) {
        this.logger.warn(
          `Request to ${path} was rate limited. Retrying... ` +
            `(attempt ${attempt} of ${this.maxRetries})`
        );
        await this.maybeSleepOnResponse(path, err?.response);
        return await this.get({path, api, config, attempt: attempt + 1});
      }
      throw wrapApiError(err, `Failed to get "${path}". `);
    }
  }

  @Memoize()
  async fetchProject(projectSlugOrId: string): Promise<Project> {
    return (await this.get({path: `/project/${projectSlugOrId}`})).data;
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
      (params) => this.get({path: url, config: {params}}),
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
        this.get({
          path: url,
          config: {params, validateStatus: validateNotFoundStatus},
        }),
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
        this.get({
          path: `/workflow/${workflowId}/job`,
          config: {
            params,
            validateStatus: validateNotFoundStatus,
          },
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
        this.get({
          path: `/project/${projectSlug}/${jobNumber}/tests`,
          config: {
            params,
            validateStatus: validateNotFoundStatus,
          },
        }),
      (item: any) => item
    );
  }
}

// CircleCI API returns 404 if no workflows or jobs exist for a given pipeline
function validateNotFoundStatus(status: number): boolean {
  return status === 200 || status === 404;
}
