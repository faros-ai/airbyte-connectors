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

import {
  CircleCIOnReadInfo,
  Job,
  Pipeline,
  Project,
  TestMetadata,
  Workflow,
} from './typings';

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
  uses_github_or_gitlab?: boolean;
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
    const blocklist: string[] = config.project_blocklist
      ? config.project_blocklist
      : [];
    const blocklist_is_nonempty = blocklist.length > 0;
    const wildCardProjects = config.project_names.includes('*');
    if (blocklist_is_nonempty && wildCardProjects) {
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

    if (config.pull_blocklist_from_graph) {
      if (blocklist_is_nonempty) {
        throw new VError(
          'If pull_blocklist_from_graph is true, project_blocklist should be empty.'
        );
      }
      if (
        !config.faros_api_url ||
        !config.faros_api_key ||
        !config.faros_graph_name
      ) {
        throw new VError(
          'If pull_blocklist_from_graph is true, faros_api_url, faros_api_key, and faros_graph_name must be provided.'
        );
      }
      if (!wildCardProjects) {
        throw new VError(
          'If pull_blocklist_from_graph is true, project_names must include wildcard "*".'
        );
      }
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

  // used by ../index.ts
  static async getProjectsWhilePullingBlocklistFromGraph(
    cci: CircleCIOnReadInfo,
    config: CircleCIConfig,
    logger: AirbyteLogger
  ): Promise<string[]> {
    logger.info(
      'Getting filtered project names while pulling blocklist from graph'
    );
    // note blocklist is in 'repo names' format
    const blocklist = await CircleCI.pullProjectsBlocklistFromGraph(
      config,
      logger
    );
    const filteredRepoNames = [];
    for (const repoName of cci.repoNames) {
      if (!blocklist.includes(repoName)) {
        filteredRepoNames.push(repoName);
      }
    }
    logger.info(`Filtered repo names: ${JSON.stringify(filteredRepoNames)}`);
    return CircleCI.getCompleteProjectNamesFromRepoNames(
      logger,
      filteredRepoNames,
      cci
    );
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

  static async getOrgSlug(config, logger: AirbyteLogger): Promise<string> {
    const axiosV2Instance = this.getAxiosInstance(config, logger);
    logger.info('Getting Org Slug');
    let slug: string = '';
    try {
      const resp = await axiosV2Instance.get('/me/collaborations');
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

  // used by ../index.ts
  static isNoChangeCase(config): boolean {
    // The case where we don't need to change the project names
    const blocklist: string[] = config.project_blocklist
      ? config.project_blocklist
      : [];
    if (
      blocklist.length == 0 &&
      !config.project_names.includes('*') &&
      !config.slugs_as_repos
    ) {
      return true;
    } else {
      return false;
    }
  }

  // used by ../index.ts
  static async getBasicInfo(config, logger): Promise<CircleCIOnReadInfo> {
    const org_slug = await CircleCI.getOrgSlug(config, logger);
    const [
      repoNamesToProjectIds,
      repoNamesToOrgIds,
      repoNames,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      orgIds,
    ] = await CircleCI.getAllRepoNamesAndProjectIds(config, logger, org_slug);
    return {
      org_slug: org_slug,
      repoNamesToProjectIds: repoNamesToProjectIds,
      repoNamesToOrgIds: repoNamesToOrgIds,
      repoNames: repoNames,
      orgIds: orgIds,
      uses_github_or_gitlab: config.uses_github_or_gitlab,
    };
  }

  // used by ../index.ts
  static filterOnBlocklist(
    start_names: string[],
    blocklist: string[],
    logger
  ): string[] {
    logger.info('Filtering on blocklist');
    const res: string[] = [];
    for (const start_name of start_names) {
      if (!blocklist.includes(start_name)) {
        res.push(start_name);
      }
    }
    return res;
  }

  // used by ../index.ts
  static getCompleteProjectNamesFromRepoNames(
    logger,
    repoNames,
    cci: CircleCIOnReadInfo
  ): string[] {
    logger.info('Getting complete project names from repo names');
    let project_names: string[] = [];
    if (cci.uses_github_or_gitlab) {
      project_names = repoNames.map(
        (v) =>
          `circleci/${cci.repoNamesToOrgIds.get(
            v
          )}/${cci.repoNamesToProjectIds.get(v)}`
      );
    } else {
      project_names = repoNames.map((v) => `${cci.org_slug}/${v}`);
    }
    return project_names;
  }

  static async pullProjectsBlocklistFromGraph(
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
        `Faros API URL, Faros API Key, and Faros Graph Name are required to pull blocklist of projects from Faros`
      );
    }
    if (!config.slugs_as_repos) {
      throw new Error(
        `When pulling blocklist projects from Faros, slugs_as_repos must be set to true`
      );
    }
    if (!config.project_names.includes('*')) {
      throw new Error(
        `When pulling blocklist of projects from Faros, project_names must include wildcard "*"`
      );
    }
    logger.info('Pulling blocklist of projects from Faros');
    const limit = 100;
    const query: string = `query BlockedRepos($after: String) {
      vcs_Repository(
        limit: ${limit} 
        order_by: {id: asc}
        where: {farosOptions: {inclusionCategory: {_eq: "Excluded"}}, _and: {id: {_gt: $after}}}
      ) {
        name
        id
      }
    }
    `;
    const fcConfig: FarosClientConfig = {
      url: config.faros_api_url,
      apiKey: config.faros_api_key,
      useGraphQLV2: true,
    };
    const fc = new FarosClient(fcConfig);
    const result = await fc.gql(config.faros_graph_name, query, {after: ''});
    if (!result?.vcs_Repository) {
      throw new Error(
        `Could not get result from calling Faros GraphQL on graph ${config.faros_graph_name} with query ${query}.`
      );
    }
    const all_ignored_repo_infos = [];
    let crt_ignored_repo_infos = result.vcs_Repository;
    all_ignored_repo_infos.push(...crt_ignored_repo_infos);
    while (crt_ignored_repo_infos.length == limit) {
      const last_repo_info =
        crt_ignored_repo_infos[crt_ignored_repo_infos.length - 1];
      const last_repo_id = last_repo_info.id;
      const result = await fc.gql(config.faros_graph_name, query, {
        after: last_repo_id,
      });
      if (!result?.vcs_Repository) {
        throw new Error(
          `Could not get result from calling Faros GraphQL on graph ${config.faros_graph_name} with query ${query}.`
        );
      }
      crt_ignored_repo_infos = result.vcs_Repository;
      all_ignored_repo_infos.push(...crt_ignored_repo_infos);
    }
    logger.debug(
      `Ignored repo infos: ${JSON.stringify(all_ignored_repo_infos)}`
    );
    const updated_blocklist: string[] = [];
    for (const ignored_repo_info of all_ignored_repo_infos) {
      updated_blocklist.push(ignored_repo_info.name);
    }
    logger.debug(`Updated block list: ${JSON.stringify(updated_blocklist)}`);
    logger.info(
      `Finished pulling ${updated_blocklist.length} blocked projects from Faros' graph`
    );
    return updated_blocklist;
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
      params: params,
    });
    return axiosInstance;
  }

  static async getAllRepoNamesAndProjectIds(
    config,
    logger,
    org_slug: string
  ): Promise<[Map<string, string>, Map<string, string>, string[], string[]]> {
    const v1AxiosInstance: AxiosInstance = this.getAxiosInstance(
      config,
      logger,
      'v1.1',
      {shallow: 'true'}
    );
    // org_slug captured through this api call: e.g. https://circleci.com/api/v2/me/collaborations
    // Using org slug, projects can be accessed with slug/repo_name (if not github or gitlab)
    // or circleci/org_id/project_id (if github or gitlab)
    const repo_names: string[] = [];
    const project_ids: string[] = [];
    const organization_ids: string[] = [];
    try {
      logger.debug(`Getting all projects from "/projects" endpoint`);
      const response = await v1AxiosInstance.get('/projects');
      logger.debug(`Finished getting all projects from "/projects" endpoint.`);
      const projects_data = response.data;
      logger.debug(`Projects data: ${JSON.stringify(projects_data)}`);
      for (const item of projects_data) {
        repo_names.push(item['reponame']);
        const vcs_url_segments = item['vcs_url'].split('/');
        project_ids.push(vcs_url_segments.pop());
        organization_ids.push(vcs_url_segments.pop());
      }
    } catch (error: any) {
      throw new Error(
        `Failed to get all project "repo names" or "project ids" from '/projects' endpoint. Error: ${wrapApiError(
          error
        )}`
      );
    }
    if (repo_names.length == 0) {
      throw new Error(
        'No reponames found for this user: Make sure to "Follow All" projects on CircleCI.'
      );
    }
    logger.debug(`Number of repo names found: ${repo_names.length}`);
    await CircleCI.checkIfUsesGithubOrGitlab(
      repo_names,
      project_ids,
      organization_ids,
      org_slug,
      config,
      logger
    );

    const repoNamesToProjectIds: Map<string, string> = new Map<
      string,
      string
    >();
    const repoNamesToOrgIds: Map<string, string> = new Map<string, string>();
    for (let i = 0; i < repo_names.length; i++) {
      repoNamesToProjectIds.set(repo_names[i], project_ids[i]);
      repoNamesToOrgIds.set(repo_names[i], organization_ids[i]);
    }
    logger.debug(
      `Repo names to project ids: ${JSON.stringify(repoNamesToProjectIds)}, ` +
        `Repo names to org ids: ${JSON.stringify(repoNamesToOrgIds)}`
    );
    return [
      repoNamesToProjectIds,
      repoNamesToOrgIds,
      repo_names,
      organization_ids,
    ];
  }

  static async checkIfUsesGithubOrGitlab(
    repo_names,
    project_ids,
    organization_ids,
    org_slug,
    config,
    logger
  ): Promise<boolean> {
    // Note: Within this function we set the 'config.uses_github_or_gitlab' variable to true or false
    // In this function we check if the project name is "gitlab or github" format,
    // or the "regular" format. We do this by running the query on both formats
    // and seeing which one works.  Explanation of the formats at the link below:
    // https://circleci.com/docs/api/v2/index.html#operation/getProjectBySlug
    logger.info('Running diagnostics on CircleCI API');
    // If we enter this function we are guaranteed to have at least one repo name
    const first_repo = repo_names[0];
    const axios_v2_instance = CircleCI.getAxiosInstance(config, logger, 'v2');
    const projectSlug = `${org_slug}/${first_repo}`;
    const urlExtension = `/project/${projectSlug}`;
    let regular_success = true;
    try {
      const res = await axios_v2_instance.get(urlExtension);
      logger.info(
        `Diagnostic on ${urlExtension}: status: ${
          res.status
        }, data: ${JSON.stringify(res.data)}`
      );
    } catch (error: any) {
      logger.info(
        `Failed to get project from CircleCI API using ${urlExtension}. Error: ` +
          error
      );
      regular_success = false;
    }
    let git_success = true;
    const first_org_id = organization_ids[0];
    const first_project_id = project_ids[0];
    const gitProjectSlug = `circleci/${first_org_id}/${first_project_id}`;
    const gitUrlExtension = `/project/${gitProjectSlug}`;
    try {
      const gitRes = await axios_v2_instance.get(gitUrlExtension);
      logger.info(
        `Diagnostic on ${gitUrlExtension}: status: ${
          gitRes.status
        }, data: ${JSON.stringify(gitRes.data)}`
      );
    } catch (error: any) {
      logger.info(
        `Failed to get project from CircleCI API using ${gitUrlExtension}. Error: ` +
          error
      );
      git_success = false;
    }
    if (!regular_success && !git_success) {
      throw new Error(
        `Failed to get project from CircleCI API using ${urlExtension} and ${gitUrlExtension}.`
      );
    } else if (!regular_success) {
      config.uses_github_or_gitlab = true;
    } else {
      config.uses_github_or_gitlab = false;
    }
    const git_log_message = config.uses_github_or_gitlab
      ? 'Uses Github or Gitlab'
      : 'Does not use Github or Gitlab';
    logger.info(`Finished running diagnostic. ${git_log_message}.`);
    return config.uses_github_or_gitlab;
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
