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

export abstract class AzureDevOps {
  private static azureDevOps: AzureDevOps = null;

  constructor(
    protected readonly client: types.AzureDevOpsClient,
    protected readonly cutoffDays: number = DEFAULT_CUTOFF_DAYS,
    protected readonly top: number = DEFAULT_PAGE_SIZE,
    protected readonly logger: AirbyteLogger
  ) {}

  static async instance<T extends AzureDevOps>(
    config: types.AzureDevOpsConfig,
    logger: AirbyteLogger
  ): Promise<T> {
    if (AzureDevOps.azureDevOps) {
      return AzureDevOps.azureDevOps as T;
    }

    AzureDevOps.validateAuth(config);

    if (config.instance?.type) {
      logger.info(`Azure DevOps instance type: ${config.instance.type}`);
    } else {
      logger.info(
        'No Azure DevOps instance type provided, will attempt to use Azure DevOps Services (cloud)'
      );
    }

    const azureDevOps =
      config.instance?.type === 'server'
        ? await AzureDevOpsServer.instance(config, logger)
        : await AzureDevOpsServices.instance(config, logger);

    AzureDevOps.azureDevOps = azureDevOps;
    return azureDevOps as T;
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
  static async createNodeClients(
    apiUrl: string,
    organization: string,
    accessToken: string,
    timeout: number = DEFAULT_REQUEST_TIMEOUT,
    maxRetries: number = DEFAULT_MAX_RETRIES
  ): Promise<types.AzureDevOpsClient> {
    const baseUrl = `${apiUrl}/${organization}`;
    const authHandler = getPersonalAccessTokenHandler(accessToken);
    const connection = new WebApi(baseUrl, authHandler, {
      socketTimeout: timeout,
      allowRetries: true,
      maxRetries,
      globalAgentOptions: {
        keepAlive: true,
        timeout,
      },
    });

    return {
      core: await connection.getCoreApi(),
      wit: await connection.getWorkItemTrackingApi(),
      git: await connection.getGitApi(),
    };
  }

  protected async *getPaginated<T>(
    getFn: (top: number, skip: number) => Promise<Array<T>>
  ): AsyncGenerator<T> {
    let resCount = 0;
    let skip = 0;
    const top = this.top;

    do {
      const res = await getFn(top, skip);
      if (res.length) yield* res;
      resCount = res.length;
      skip += resCount;
    } while (resCount >= top);
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
      skip: number
    ): Promise<Array<TeamProjectReference>> => {
      const res = await this.client.core.getProjects('wellFormed', top, skip);
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
      skip: number
    ): Promise<WebApiTeam[]> =>
      this.client.core.getTeams(projectId, false, pageSize, skip);

    yield* this.getPaginated<WebApiTeam>(getTeamsFn);
  }

  protected async *getTeamMembers(
    projectId: string,
    teamId: string
  ): AsyncGenerator<IdentityRef> {
    const getMembersFn = (top: number, skip: number): Promise<TeamMember[]> =>
      this.client.core.getTeamMembersWithExtendedProperties(
        projectId,
        teamId,
        top,
        skip
      );

    for await (const member of this.getPaginated(getMembersFn)) {
      yield member.identity;
    }
  }

  // Defaulting to using Azure DevOps Services (cloud) Graph API for users.
  // Overridden for AzureDevOpsServer class
  async *getUsers(): AsyncGenerator<GraphUser> {
    if (!this.client.graph) {
      throw new VError(
        'Failed to create Graph API client for Azure DevOps Services (cloud)'
      );
    }

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
}

class AzureDevOpsServices extends AzureDevOps {
  static async instance<T extends AzureDevOps>(
    config: types.AzureDevOpsConfig,
    logger: AirbyteLogger
  ): Promise<T> {
    const nodeClient = await AzureDevOps.createNodeClients(
      CLOUD_API_URL,
      config.organization,
      config.access_token,
      config.request_timeout,
      config.max_retries
    );

    const timeout = config.request_timeout ?? DEFAULT_REQUEST_TIMEOUT;
    const maxRetries = config.max_retries ?? DEFAULT_MAX_RETRIES;
    const accessToken = base64Encode(`:${config.access_token}`);

    // Graph API is only available in Azure DevOps Cloud for users, groups, and group memberships
    // https://learn.microsoft.com/en-us/rest/api/azure/devops/graph
    const graphClient = makeAxiosInstanceWithRetry(
      {
        baseURL: `${DEFAULT_GRAPH_API_URL}/${config.organization}/_apis/graph`,
        timeout,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        params: {'api-version': DEFAULT_GRAPH_API_VERSION},
        headers: {Authorization: `Basic ${accessToken}`},
      },
      logger.asPino(),
      maxRetries,
      1000 // Default retry delay
    );

    const client = {
      ...nodeClient,
      graph: graphClient,
    };

    const top = config.page_size ?? DEFAULT_PAGE_SIZE;
    const cutoffDays = config.cutoff_days ?? DEFAULT_CUTOFF_DAYS;
    return new AzureDevOpsServices(client, cutoffDays, top, logger) as T;
  }
}

class AzureDevOpsServer extends AzureDevOps {
  static async instance<T extends AzureDevOps>(
    config: types.AzureDevOpsConfig,
    logger: AirbyteLogger
  ): Promise<T> {
    const instance = config.instance as types.DevOpsServer;
    AzureDevOpsServer.validateApiUrl(instance);
    const client = await AzureDevOps.createNodeClients(
      instance.api_url,
      config.organization,
      config.access_token,
      config.request_timeout,
      config.max_retries
    );

    const top = config.page_size ?? DEFAULT_PAGE_SIZE;
    const cutoffDays = config.cutoff_days ?? DEFAULT_CUTOFF_DAYS;
    return new AzureDevOpsServer(client, cutoffDays, top, logger) as T;
  }

  static validateApiUrl(instance: types.DevOpsServer): void {
    if (!instance?.api_url?.trim()) {
      throw new VError(
        'api_url must not be an empty string for server instance type'
      );
    }

    try {
      new URL(instance.api_url.trim());
    } catch (error) {
      throw new VError(`Invalid URL: ${instance.api_url}`);
    }
  }

  // Azure DevOps Server has no Graph API so fetching users through
  // REST API through teams and team members
  async *getUsers(
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
