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
  readonly project_block_list: ReadonlyArray<string>;
  // Applying block list to project names results in filtered_project_names
  filtered_project_names?: string[];
  readonly reject_unauthorized: boolean;
  readonly slugs_as_repos: boolean;
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
    const cutoffDays = config.cutoff_days ?? DEFAULT_CUTOFF_DAYS;
    const axios_v2_instance = this.getAxiosInstance(config, logger, 'v2');

    CircleCI.circleCI = new CircleCI(
      logger,
      axios_v2_instance,
      cutoffDays,
      config.max_retries ?? DEFAULT_MAX_RETRIES
    );
    return CircleCI.circleCI;
  }

  async checkConnection(): Promise<void> {
    try {
      await this.axios.get(`/me`);
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

  static async getOrgSlug(
    circleCIV2Instance: AxiosInstance,
    logger: AirbyteLogger
  ): Promise<string> {
    logger.info('Getting Org Slug');
    let slug: string = '';
    try {
      const resp = await circleCIV2Instance.get('/me/collaborations');
      if (resp.status != 200) {
        throw new Error(
          `Failed response from endpoint 'me/collaborations' for getting slug.`
        );
      }
      const resp_data = resp.data[0];
      slug = resp_data['slug'];
    } catch (error: any) {
      throw new Error(
        `Failed to get org slug from '/me/collaborations' endpoint`
      );
    }
    if (slug === '') {
      throw new Error(`Failed to get slug from '/me/collaborations' endpoint`);
    }
    logger.info(`Got Org Slug: ${slug}`);
    return slug;
  }

  static async updateProjectNamesWithBlocklist(
    config: CircleCIConfig,
    logger: AirbyteLogger,
    org_slug: string
  ): Promise<string[]> {
    // If slugs are repos, we return list of repos
    // If slugs are slugs, we return a list of slugs
    let project_names = config.project_names;
    if (project_names.includes('*')) {
      // project names has the wildcard, which means we need to
      // get all the project names and then remove the projects in the
      // block list
      logger.info(
        'Wildcard Project name found - calling API to get all project names.'
      );

      const repoNames = await this.getAllRepoNames(config, logger);
      logger.info(`Got these repo names: ${JSON.stringify(repoNames)}`);
      if (!config.slugs_as_repos) {
        project_names = repoNames.map((v) => `${org_slug}/${v}`);
      } else {
        project_names = repoNames;
      }
      logger.info(`Got these project names: ${JSON.stringify(project_names)}`);
    }
    let res: string[] = [];
    for (const project_name of project_names) {
      if (!config.project_block_list.includes(project_name)) {
        res.push(project_name);
      }
    }
    if (config.slugs_as_repos) {
      res = res.map((v) => `${org_slug}/${v}`);
    }
    return res;
  }

  static getAxiosInstance(
    config: CircleCIConfig,
    logger: AirbyteLogger,
    api_version: string = 'v2'
  ): AxiosInstance {
    const rejectUnauthorized = config.reject_unauthorized ?? true;
    let url = config.url ?? DEFAULT_API_URL;
    if (api_version != 'v2') {
      const original_url = url;
      url = url.replace('v2', api_version);
      logger.info(
        `Replacing URL version. Original url: ${original_url}, new: ${url}.`
      );
    }
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
    });
    return axiosInstance;
  }

  static async getAllRepoNames(config, logger): Promise<string[]> {
    const v1AxiosInstance: AxiosInstance = this.getAxiosInstance(
      config,
      logger,
      'v1.1'
    );
    // ORG SLUG:
    // https://circleci.com/api/v2/me/collaborations
    // Using org slug, projects can be accessed with slug/repo_name
    const op: string[] = [];
    try {
      const response = await v1AxiosInstance.get('/projects');
      const projects_data = response.data;
      logger.info(`Projects data: ${JSON.stringify(projects_data)}`);
      for (const item of projects_data) {
        op.push(item['reponame']);
      }
    } catch (error: any) {
      throw new Error(`Failed to get all repo names from '/projects' endpoint`);
    }
    if (op.length == 0) {
      throw new Error('No reponames found for this user');
    }
    return op;
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
