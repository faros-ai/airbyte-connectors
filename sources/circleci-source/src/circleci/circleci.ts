import axios, {
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
} from 'axios';
import {AirbyteLogger, wrapApiError} from 'faros-airbyte-cdk';
import {FarosClient, FarosClientConfig} from 'faros-js-client';
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
  readonly project_blocklist?: string[];
  // Applying project_blocklist to project_names results in filtered_project_names
  filtered_project_names?: string[];
  readonly reject_unauthorized: boolean;
  readonly slugs_as_repos?: boolean;
  readonly cutoff_days?: number;
  readonly url?: string;
  readonly request_timeout?: number;
  readonly max_retries?: number;
  readonly pull_blocklist_from_graph?: boolean;
  readonly faros_api_url?: string;
  readonly faros_api_key?: string;
  readonly faros_graph_name?: string;
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
    if (config.project_names.includes('*') && config.project_names.length > 1) {
      throw new VError(
        'If wildcard is included in project names, do not include other project names'
      );
    }
    if (
      config.project_blocklist?.length > 0 &&
      !config.project_names.includes('*')
    ) {
      throw new VError(
        'If blocklist contains values, project_names should only include wildcard "*".'
      );
    }
    if (
      typeof config.slugs_as_repos !== 'undefined' &&
      typeof config.slugs_as_repos !== 'boolean'
    ) {
      throw new VError(
        `Config variable "slugs_as_repos" should be set as boolean, instead it is set as "${typeof config.slugs_as_repos}"`
      );
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
          `Non-200 response from endpoint 'me/collaborations' for getting slug.`
        );
      }
      const resp_data = resp.data[0];
      slug = resp_data['slug'];
    } catch (error: any) {
      throw new Error(
        `Failed to get org slug from '/me/collaborations' endpoint for this reason: ${error}`
      );
    }
    if (slug === '') {
      throw new Error(`Failed to get slug from '/me/collaborations' endpoint`);
    }
    logger.info(`Got Org Slug: ${slug}`);
    return slug;
  }

  static async getFilteredProjectsFromRepoNames(
    config: CircleCIConfig,
    logger: AirbyteLogger,
    blocklist: string[] = []
  ): Promise<string[]> {
    // Note the project names are not full slugs but only the repo names,
    // e.g. repo-name rather than vcs-slug/org-name/repo-name
    const axiosV2Instance = CircleCI.getAxiosInstance(config, logger);
    const org_slug: string = await CircleCI.getOrgSlug(axiosV2Instance, logger);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [repoNamesToProjectIds, repoNames, _projectIds] =
      await this.getAllRepoNamesAndProjectIds(config, logger);

    if (!config.project_names.includes('*')) {
      const repo_names = config.project_names;
      const project_names = repo_names.map(
        (v) => `${org_slug}/${repoNamesToProjectIds.get(v)}`
      );
      return project_names;
    }
    // In this case there is a wildcard to get project names
    // We already have all the repo names stored as repoNames
    const res: string[] = [];
    for (const project_name of repoNames) {
      if (!blocklist.includes(project_name)) {
        res.push(project_name);
      }
    }
    const project_names = res.map(
      (v) => `${org_slug}/${repoNamesToProjectIds.get(v)}`
    );
    return project_names;
  }

  static async pullBlockedProjectsFromGraph(
    config: CircleCIConfig,
    logger: AirbyteLogger
  ): Promise<string[]> {
    // We check if the user has provided the necessary information to pull blocked
    // projects from graph
    if (
      !config.faros_api_url ||
      !config.faros_api_key ||
      !config.faros_graph_name
    ) {
      throw new Error(
        `Faros API URL, Faros API Token, and Faros Graph Name are required to pull blocked projects from Faros`
      );
    }
    if (!config.slugs_as_repos) {
      throw new Error(
        `When pulling blocked repos from Faros, slugs_as_repos must be set to true`
      );
    }
    if (!config.project_names.includes('*')) {
      throw new Error(
        `When pulling blocked repos from Faros, project_names must include wildcard "*"`
      );
    }
    logger.info('Pulling blocked projects from Faros');
    const query: string =
      'query BlockedRepos { vcs_Repository(where: {farosOptions: {inclusionCategory: {_eq: "Excluded"}}}) { name } }';
    const fcConfig: FarosClientConfig = {
      url: config.faros_api_url,
      apiKey: config.faros_api_key,
      useGraphQLV2: true,
    };
    const fc = new FarosClient(fcConfig);
    const result = await fc.gql(config.faros_graph_name, query);
    if (!result) {
      throw new Error(
        `Could not get result from calling Faros GraphQL on graph ${config.faros_graph_name} with query ${query}.`
      );
    }
    const ignored_repo_infos = result.vcs_Repository;
    if (!ignored_repo_infos) {
      throw new Error(`Failed to get ignored repos from '/graphql' endpoint.`);
    }
    logger.debug(`Ignored repo infos: ${JSON.stringify(ignored_repo_infos)}`);
    const updated_blocklist: string[] = [];
    for (const ignored_repo_info of ignored_repo_infos) {
      updated_blocklist.push(ignored_repo_info.name);
    }
    logger.debug(`Updated block list: ${JSON.stringify(updated_blocklist)}`);
    if (updated_blocklist.length == 1000) {
      throw new Error(
        "Block list reached graphql's max limit of 1000. Please reach out to Faros for support."
      );
    }
    logger.info(
      `Finished pulling blocked projects from Faros' graph. Got ${updated_blocklist.length} blocked projects.`
    );
    return updated_blocklist;
  }

  static async getFilteredProjects(
    config: CircleCIConfig,
    logger: AirbyteLogger,
    blocklist: string[] = []
  ): Promise<string[]> {
    // Note the project names are not repo names but also include the slug,
    // e.g.  `vcs-slug/org-name/repo-name` rather than `repo-name`
    if (!config.project_names.includes('*')) {
      return Array.from(config.project_names);
    }
    const project_names = await this.getWildCardProjectNames(config, logger);
    const res: string[] = [];
    for (const project_name of project_names) {
      if (!blocklist.includes(project_name)) {
        res.push(project_name);
      }
    }
    return res;
  }

  static async getWildCardProjectNames(
    config: CircleCIConfig,
    logger: AirbyteLogger
  ): Promise<string[]> {
    // We return list of updated project names
    // In this case we know project names has a wildcard
    // Always returns list of complete project names (not just repo names)
    if (!config.project_names.includes('*')) {
      throw new Error(
        `Expected project_names to just be the wildcard, instead got: ${JSON.stringify(
          config.project_names
        )}`
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [_repoNamesToProjectIds, _repoNames, projectIds] =
      await this.getAllRepoNamesAndProjectIds(config, logger);
    const axiosV2Instance = CircleCI.getAxiosInstance(config, logger);
    const org_slug: string = await CircleCI.getOrgSlug(axiosV2Instance, logger);
    const project_names = projectIds.map((v) => `${org_slug}/${v}`);
    logger.info(
      `Project names based on config: ${JSON.stringify(project_names)}`
    );
    return project_names;
  }

  static getAxiosInstance(
    config: CircleCIConfig,
    logger: AirbyteLogger,
    api_version: string = 'v2'
  ): AxiosInstance {
    // In this function we rely on the fact that the  API URL contains 'v{X}' in it,
    // where X is the version number, e.g. "2" or "1.1". We replace the
    // version number with the one we want to use, stored in the param 'api_version'
    let url = config.url ?? DEFAULT_API_URL;
    const versionRegex = /v\d+(\.\d+)?/g;
    url = url.replace(versionRegex, api_version);
    logger.info(`Using API URL: "${url}"`);
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
    });
    return axiosInstance;
  }

  static async getAllRepoNamesAndProjectIds(
    config,
    logger
  ): Promise<[Map<string, string>, string[], string[]]> {
    const v1AxiosInstance: AxiosInstance = this.getAxiosInstance(
      config,
      logger,
      'v1.1'
    );
    // ORG SLUG:
    // https://circleci.com/api/v2/me/collaborations
    // Using org slug, projects can be accessed with slug/repo_name
    const repo_names: string[] = [];
    const project_ids: string[] = [];
    try {
      const response = await v1AxiosInstance.get('/projects');
      const projects_data = response.data;
      logger.info(`Projects data: ${JSON.stringify(projects_data)}`);
      for (const item of projects_data) {
        repo_names.push(item['reponame']);
        project_ids.push(item['vcs_url'].split('/').pop());
      }
    } catch (error: any) {
      throw new Error(
        `Failed to get all project "repo names" or "project ids" from '/projects' endpoint`
      );
    }
    if (repo_names.length == 0) {
      throw new Error('No reponames found for this user');
    }
    const repoNamesToProjectIds: Map<string, string> = new Map<
      string,
      string
    >();
    for (let i = 0; i < repo_names.length; i++) {
      repoNamesToProjectIds.set(repo_names[i], project_ids[i]);
    }
    return [repoNamesToProjectIds, repo_names, project_ids];
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
      throw wrapApiError(err, `Failed to get "${path}". `);
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
