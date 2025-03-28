import {AxiosInstance} from 'axios';
import {getPersonalAccessTokenHandler, WebApi} from 'azure-devops-node-api';
import {
  IdentityRef,
  TeamMember,
} from 'azure-devops-node-api/interfaces/common/VSSInterfaces';
import {
  TeamProject,
  TeamProjectReference,
  WebApiTeam,
} from 'azure-devops-node-api/interfaces/CoreInterfaces';
import {GraphUser} from 'azure-devops-node-api/interfaces/GraphInterfaces';
import {AirbyteLogger, base64Encode} from 'faros-airbyte-cdk';
import {makeAxiosInstanceWithRetry} from 'faros-js-client';
import {Memoize} from 'typescript-memoize';
import VError from 'verror';

import * as types from './types';

const CLOUD_API_URL = 'https://dev.azure.com';
const DEFAULT_GRAPH_API_URL = 'https://vssps.dev.azure.com';
const DEFAULT_GRAPH_API_VERSION = '7.1-preview.1';
const DEFAULT_REQUEST_TIMEOUT = 300_000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_CUTOFF_DAYS = 90;

/**
 * This abstract class is used to create Azure DevOps clients.
 * Extended by Azure DevOps sources that need to access Azure DevOps APIs,
 * such as Azure Repos, Azure Pipelines, Azure Work Items, etc.
 *
 * @abstract
 * @class AzureDevOps
 */
export abstract class AzureDevOps {
  private static azureDevOps: AzureDevOps = null;

  constructor(
    protected readonly client: types.AzureDevOpsClient,
    protected readonly cutoffDays: number = DEFAULT_CUTOFF_DAYS,
    protected readonly top: number = DEFAULT_PAGE_SIZE,
    protected readonly logger: AirbyteLogger
  ) {}

  static async instance<T extends AzureDevOps>(
    this: new (...args: any[]) => T,
    config: types.AzureDevOpsConfig,
    logger: AirbyteLogger,
    ...rest: any[]
  ): Promise<T> {
    if (AzureDevOps.azureDevOps) {
      return AzureDevOps.azureDevOps as T;
    }

    AzureDevOps.validateAuth(config);

    if (config.instance?.type) {
      logger.info(`Azure DevOps instance type: ${config.instance.type}`);
    } else {
      logger.info(
        'No Azure DevOps instance type provided, will attempt to use ' +
          'Azure DevOps Services (cloud)'
      );
    }

    const apiUrl = AzureDevOps.getApiUrl(config?.instance);
    const timeout = config.request_timeout ?? DEFAULT_REQUEST_TIMEOUT;
    const maxRetries = config.max_retries ?? DEFAULT_MAX_RETRIES;
    const webApi = await AzureDevOps.createWebAPI(
      apiUrl,
      config.organization,
      config.access_token,
      timeout,
      maxRetries
    );
    const graphApi = AzureDevOps.createGraphAPI(
      config.instance,
      config.organization,
      config.access_token,
      timeout,
      maxRetries,
      logger
    );

    const client = {
      build: await webApi.getBuildApi(),
      core: await webApi.getCoreApi(),
      wit: await webApi.getWorkItemTrackingApi(),
      git: await webApi.getGitApi(),
      pipelines: await webApi.getPipelinesApi(),
      release: await webApi.getReleaseApi(),
      test: await webApi.getTestApi(),
      graph: graphApi,
    };

    const pageSize = isNaN(config.page_size) ? undefined : config.page_size;
    if (pageSize && pageSize <= 1) {
      logger.warn(
        'Page size must be greater than 1, will use default minimum of 2'
      );
    }

    const top = Math.max(2, pageSize ?? DEFAULT_PAGE_SIZE);
    const cutoffDays = config.cutoff_days ?? DEFAULT_CUTOFF_DAYS;

    AzureDevOps.azureDevOps = new this(
      client,
      cutoffDays,
      top,
      logger,
      ...rest
    );
    return AzureDevOps.azureDevOps as T;
  }

  static getApiUrl(instance: types.AzureDevOpsInstance): string {
    if (instance?.type !== 'server') {
      return CLOUD_API_URL;
    }

    const apiUrl = instance?.api_url?.trim();
    if (!apiUrl) {
      throw new VError(
        'api_url must not be an empty string for server instance type'
      );
    }

    try {
      new URL(apiUrl);
    } catch (error) {
      throw new VError(`Invalid URL: ${instance?.api_url}`);
    }
    return apiUrl;
  }

  static validateAuth(config: types.AzureDevOpsConfig): void {
    if (!config.access_token) {
      throw new VError('access_token must not be an empty string');
    }
    if (!config.organization) {
      throw new VError('organization must not be an empty string');
    }
  }

  // Create Azure DevOps Node API clients
  static async createWebAPI(
    apiUrl: string,
    organization: string,
    accessToken: string,
    timeout: number = DEFAULT_REQUEST_TIMEOUT,
    maxRetries: number = DEFAULT_MAX_RETRIES
  ): Promise<WebApi> {
    const baseUrl = `${apiUrl}/${organization}`;
    const authHandler = getPersonalAccessTokenHandler(accessToken);
    return new WebApi(baseUrl, authHandler, {
      socketTimeout: timeout,
      allowRetries: true,
      maxRetries,
      globalAgentOptions: {
        keepAlive: true,
        timeout,
      },
    });
  }

  static createGraphAPI(
    instance: types.AzureDevOpsInstance,
    organization: string,
    access_token: string,
    timeout: number,
    maxRetries: number,
    logger: AirbyteLogger
  ): AxiosInstance | undefined {
    if (instance?.type === 'server') {
      return undefined;
    }

    const base64EncodedToken = base64Encode(`:${access_token}`);
    return makeAxiosInstanceWithRetry(
      {
        baseURL: `${DEFAULT_GRAPH_API_URL}/${organization}/_apis/graph`,
        timeout,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        params: {'api-version': DEFAULT_GRAPH_API_VERSION},
        headers: {Authorization: `Basic ${base64EncodedToken}`},
      },
      logger.asPino(),
      maxRetries,
      1000 // Default retry delay
    );
  }

  protected async *getPaginated<T>(
    getFn: (top: number, skipOrToken: number | string) => Promise<Array<T>>,
    options?: {
      useContinuationToken: boolean;
      continuationTokenParam: string;
    }
  ): AsyncGenerator<T> {
    if (options?.useContinuationToken) {
      yield* this.paginateWithContinuationToken(
        getFn,
        options.continuationTokenParam
      );
    } else {
      yield* this.paginateWithSkip(getFn);
    }
  }

  private async *paginateWithSkip<T>(
    getFn: (top: number, skip: number) => Promise<Array<T>>
  ): AsyncGenerator<T> {
    let resCount = 0;
    let skip = 0;
    const top = this.top;

    do {
      const result = await getFn(top, skip);
      if (result.length) yield* result;
      resCount = result.length;
      skip += resCount;
    } while (resCount >= top);
  }

  // Workaround for Azure DevOps API pagination not returning the continuation token
  // https://github.com/microsoft/azure-devops-node-api/issues/609
  private async *paginateWithContinuationToken<T>(
    getFn: (
      top: number,
      continuationToken: string | number
    ) => Promise<Array<T>>,
    continuationTokenParam: string
  ): AsyncGenerator<T> {
    const top = this.top;
    let hasNext = false;
    let pages = 0;
    let continuationToken = undefined;

    do {
      const result = await getFn(top, continuationToken);
      if (!result) {
        this.logger.warn(
          'Failed to fetch results, received empty result. Skipping...'
        );
        return;
      }

      if (!Array.isArray(result)) {
        throw new VError(
          `Expected array result but got ${typeof result} ${JSON.stringify(
            result
          )}`
        );
      }

      // Remove the first record when we have a continuation token to avoid duplication
      // since we already processed it in the previous page
      const records = continuationToken ? result.slice(1) : result;
      yield* records;

      continuationToken =
        result.length === top
          ? result.at(-1)[continuationTokenParam]
          : undefined;

      hasNext = Boolean(continuationToken);
      pages++;
      this.logger.debug(
        hasNext
          ? `Fetching next page using continuation token ${continuationToken}`
          : `Finished fetching ${pages} pages`
      );
    } while (hasNext);
  }

  @Memoize()
  async getProjects(
    projects?: ReadonlyArray<string>
  ): Promise<ReadonlyArray<TeamProject>> {
    if (!projects?.length) {
      return await this.getAllProjects();
    }

    const allProjects = [];
    for (const project of projects) {
      const res = await this.client.core.getProject(project);
      if (res) {
        allProjects.push(res);
      } else {
        this.logger.warn(`Project ${project} in config not found. Skipping`);
      }
    }
    return allProjects;
  }

  private async getAllProjects(): Promise<ReadonlyArray<TeamProjectReference>> {
    const projects = [];
    const getProjectsFn = async (
      top: number,
      skip: number | string
    ): Promise<Array<TeamProjectReference>> => {
      const res = await this.client.core.getProjects(
        'wellFormed',
        top,
        skip as number
      );
      return Array.from(res.values());
    };

    for await (const project of this.getPaginated(getProjectsFn)) {
      projects.push(project);
    }
    return projects;
  }

  protected async *getTeams(projectId: string): AsyncGenerator<WebApiTeam> {
    const getTeamsFn = (
      pageSize: number,
      skip: number | string
    ): Promise<WebApiTeam[]> =>
      this.client.core.getTeams(projectId, false, pageSize, skip as number);

    yield* this.getPaginated<WebApiTeam>(getTeamsFn);
  }

  protected async *getTeamMembers(
    projectId: string,
    teamId: string
  ): AsyncGenerator<IdentityRef> {
    const getMembersFn = (
      top: number,
      skip: number | string
    ): Promise<TeamMember[]> =>
      this.client.core.getTeamMembersWithExtendedProperties(
        projectId,
        teamId,
        top,
        skip as number
      );

    for await (const member of this.getPaginated(getMembersFn)) {
      yield member.identity;
    }
  }

  // If graph API is available, i.e. Azure DevOps Services (cloud) instance,
  // use it to fetch users. Otherwise, fetch users through teams and
  // team members (Azure DevOps Server)
  async *getUsers(
    projects?: ReadonlyArray<string>
  ): AsyncGenerator<types.User> {
    if (this.client.graph) {
      yield* this.getGraphUsers();
      return;
    }
    yield* this.getTeamUsers(projects);
  }

  private async *getGraphUsers(): AsyncGenerator<GraphUser> {
    let continuationToken: string;
    do {
      const res = await this.client.graph.get<types.GraphUserResponse>(
        'users',
        {
          params: {subjectTypes: 'msa,aad,imp', continuationToken},
        }
      );
      continuationToken = res?.headers?.['X-MS-ContinuationToken'];
      for (const item of res?.data?.value ?? []) {
        yield item;
      }
    } while (continuationToken);
  }

  private async *getTeamUsers(
    projects?: ReadonlyArray<string>
  ): AsyncGenerator<IdentityRef> {
    const seenUsers = new Set<string>();
    let teams = 0;

    for (const project of await this.getProjects(projects)) {
      for await (const team of this.getTeams(project.id)) {
        teams++;
        for await (const member of this.getTeamMembers(project.id, team.id)) {
          if (!seenUsers.has(member.uniqueName)) {
            seenUsers.add(member.uniqueName);
            yield member;
          }
        }
      }
    }
    this.logger.debug(`Fetched ${seenUsers.size} members from ${teams} teams`);
  }
}
