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

interface ResponseWithContinuationToken {
  continuationToken?: string;
}

type ItemFromResponseWithContinuationToken<
  T extends ResponseWithContinuationToken,
  K extends keyof T,
> = T[K] extends (infer U)[] ? U : never;

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
    protected readonly instanceType: 'cloud' | 'server',
    protected readonly cutoffDays: number = DEFAULT_CUTOFF_DAYS,
    protected readonly top: number = DEFAULT_PAGE_SIZE,
    protected readonly logger: AirbyteLogger
  ) {}

  static async instance<T extends AzureDevOps>(
    this: new (...args: any[]) => T,
    config: types.AzureDevOpsConfig,
    logger: AirbyteLogger,
    ...additionalArgs: any[]
  ): Promise<T> {
    if (AzureDevOps.azureDevOps) {
      return AzureDevOps.azureDevOps as T;
    }

    AzureDevOps.validateAuth(config);

    if (config.instance?.type) {
      logger.info(`Azure DevOps instance type: ${config.instance.type}`);
    } else {
      logger.info(
        'No Azure DevOps instance type provided, defaulting to ' +
          'Azure DevOps Services (cloud)'
      );
    }

    const baseUrl = AzureDevOps.getBaseUrl(
      config?.instance,
      config.organization
    );
    const timeout = config.request_timeout ?? DEFAULT_REQUEST_TIMEOUT;
    const maxRetries = config.max_retries ?? DEFAULT_MAX_RETRIES;
    const webApi = await AzureDevOps.createWebAPI(
      baseUrl,
      config.access_token,
      timeout,
      maxRetries
    );
    const restApi = AzureDevOps.createRestAPI(
      baseUrl,
      config.access_token,
      timeout,
      maxRetries,
      logger
    );

    const graphApi = AzureDevOps.createRestAPI(
      `${DEFAULT_GRAPH_API_URL}/${config.organization}/_apis/graph`,
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
      rest: restApi,
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
      config.instance?.type,
      cutoffDays,
      top,
      logger,
      ...additionalArgs
    );
    return AzureDevOps.azureDevOps as T;
  }

  static getBaseUrl(
    instance: types.AzureDevOpsInstance,
    organization: string
  ): string {
    if (instance?.type?.toLowerCase() !== 'server') {
      return `${CLOUD_API_URL}/${organization}`;
    }

    // Type assertion since we've verified it's a server instance
    const serverInstance = instance as types.DevOpsServer;
    const apiUrl = serverInstance.api_url?.trim();
    if (!apiUrl) {
      throw new VError(
        'api_url must not be an empty string for server instance type'
      );
    }

    try {
      new URL(apiUrl);
    } catch (error) {
      throw new VError(`Invalid URL: ${serverInstance.api_url}`);
    }
    return `${apiUrl}/${organization}`;
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
    baseUrl: string,
    accessToken: string,
    timeout: number = DEFAULT_REQUEST_TIMEOUT,
    maxRetries: number = DEFAULT_MAX_RETRIES
  ): Promise<WebApi> {
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

  static createRestAPI(
    baseUrl: string,
    access_token: string,
    timeout: number,
    maxRetries: number,
    logger: AirbyteLogger
  ): AxiosInstance | undefined {
    const base64EncodedToken = base64Encode(`:${access_token}`);
    return makeAxiosInstanceWithRetry(
      {
        baseURL: baseUrl,
        timeout,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        headers: {
          Authorization: `Basic ${base64EncodedToken}`,
        },
      },
      logger.asPino(),
      maxRetries,
      1000 // Default retry delay
    );
  }

  // Overload for standard skip-based pagination (no options)
  protected getPaginated<T>(
    getFn: (top: number, skipOrToken: number | string) => Promise<Array<T>>
  ): AsyncGenerator<T>;

  // Overload for continuation token pagination workaround
  protected getPaginated<T>(
    getFn: (top: number, skipOrToken: number | string) => Promise<Array<T>>,
    options: {
      useContinuationToken: true;
      continuationTokenParam: string;
    }
  ): AsyncGenerator<T>;

  // Overload for continuation token pagination
  protected getPaginated<
    T extends ResponseWithContinuationToken,
    K extends keyof T,
  >(
    getFn: (top: number, skipOrToken: number | string) => Promise<T>,
    options: {
      useContinuationToken: true;
      itemsField: K;
    }
  ): AsyncGenerator<ItemFromResponseWithContinuationToken<T, K>>;

  // Implementation signature
  protected async *getPaginated<T, K extends keyof T = any>(
    getFn: (top: number, skipOrToken: number | string) => Promise<Array<T> | T>,
    options?: {
      useContinuationToken?: boolean;
      continuationTokenParam?: string;
      itemsField?: string;
    }
  ): AsyncGenerator<T | ItemFromResponseWithContinuationToken<T, K>> {
    if (options?.useContinuationToken) {
      if (!options?.itemsField) {
        yield* this.paginateWithContinuationTokenWorkaround(
          getFn as (
            top: number,
            continuationToken: number | string
          ) => Promise<Array<T>>,
          options.continuationTokenParam
        );
      } else {
        yield* this.paginateWithContinuationToken(
          getFn as (
            top: number,
            continuationToken: number | string
          ) => Promise<T>,
          options.itemsField
        );
      }
    } else {
      // Skip-based pagination
      yield* this.paginateWithSkip(
        getFn as (top: number, skip: number) => Promise<Array<T>>
      );
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
      if (result?.length) yield* result;
      resCount = result?.length ?? 0;
      skip += resCount;
    } while (resCount >= top);
  }

  // Workaround for Azure DevOps API pagination not returning the continuation token
  // https://github.com/microsoft/azure-devops-node-api/issues/609
  private async *paginateWithContinuationTokenWorkaround<T>(
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

  // Handle responses with nested arrays and response-level continuation tokens
  private async *paginateWithContinuationToken<
    T extends ResponseWithContinuationToken,
    K extends keyof T,
  >(
    getFn: (top: number, continuationToken: string | number) => Promise<T>,
    itemsField: string
  ): AsyncGenerator<ItemFromResponseWithContinuationToken<T, K>> {
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

      // Extract the items array from the nested response
      const items = result[itemsField] as Array<
        ItemFromResponseWithContinuationToken<T, K>
      >;
      if (!Array.isArray(items)) {
        throw new VError(
          `Expected array at ${itemsField} but got ${typeof items} ${JSON.stringify(
            items
          )}`
        );
      }

      yield* items;

      // Get continuation token from the response level
      continuationToken = result.continuationToken;
      hasNext = Boolean(continuationToken);
      pages++;

      this.logger.debug(
        hasNext
          ? `Fetched page ${pages} with ${items.length} items, continuing with token ${continuationToken}`
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

  // For Azure DevOps Services (cloud) instance, use the graph API to fetch users.
  // For Azure DevOps Server instance, fetch users through teams and team members.
  async *getUsers(
    projects?: ReadonlyArray<string>
  ): AsyncGenerator<types.User> {
    if (this.instanceType?.toLowerCase() !== 'server') {
      yield* this.getGraphUsers();
      return;
    }
    yield* this.getTeamUsers(projects);
  }

  private async *getGraphUsers(): AsyncGenerator<GraphUser> {
    let continuationToken: string;
    do {
      const res = await this.client.graph.get<types.GraphUserResponse>(
        `users`,
        {
          params: {
            'api-version': DEFAULT_GRAPH_API_VERSION,
            subjectTypes: 'msa,aad,imp',
            continuationToken,
          },
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
