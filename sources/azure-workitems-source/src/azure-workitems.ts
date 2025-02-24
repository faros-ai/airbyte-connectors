import {AxiosInstance, AxiosResponse} from 'axios';
import {AirbyteLogger, base64Encode, wrapApiError} from 'faros-airbyte-cdk';
import {makeAxiosInstanceWithRetry} from 'faros-js-client';
import {chunk, flatten} from 'lodash';
import {VError} from 'verror';

import {
  AdditionalField,
  User,
  UserResponse,
  WorkItemWithRevisions,
} from './models';

import {IWorkItemTrackingApi} from 'azure-devops-node-api/WorkItemTrackingApi';
import {getPersonalAccessTokenHandler, WebApi} from 'azure-devops-node-api';
import {ICoreApi} from 'azure-devops-node-api/CoreApi';
import {
  TeamProject,
  TeamProjectReference,
  WebApiTeam,
} from 'azure-devops-node-api/interfaces/CoreInterfaces';
import {
  TreeStructureGroup,
  WorkItemClassificationNode,
  WorkItemExpand,
} from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';
import {
  IdentityRef,
  TeamMember,
} from 'azure-devops-node-api/interfaces/common/VSSInterfaces';
import {GraphUser} from 'azure-devops-node-api/interfaces/GraphInterfaces';

const DEFAULT_API_URL = 'https://dev.azure.com';
const DEFAULT_API_VERSION = '7.1';
const DEFAULT_GRAPH_API_URL = 'https://vssps.dev.azure.com';
const DEFAULT_GRAPH_VERSION = '7.1-preview.1';
const MAX_BATCH_SIZE = 200;
export const DEFAULT_REQUEST_TIMEOUT = 300_000;

// Curated list of work item types from Azure DevOps
// https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/work-item-types/list?view=azure-devops-rest-7.0&tabs=HTTP#uri-parameters
const WORK_ITEM_TYPES = [
  "'Task'",
  "'User Story'",
  "'Bug'",
  "'Feature'",
  "'Epic'",
  "'Issue'",
  "'Product Backlog Item'",
  "'Requirement'",
  "'Test Case'",
  "'Test Plan'",
  "'Test Suite'",
];

type DevOpsCloud = {
  type: 'cloud';
};

type DevOpsServer = {
  type: 'server';
  api_url: string;
  api_version: string;
  graph_api_url: string;
  graph_api_version: string;
};

export type InstanceType = DevOpsCloud | DevOpsServer;

export interface AzureWorkitemsConfig {
  readonly instance_type: InstanceType;
  readonly access_token: string;
  readonly organization: string;
  readonly project: string;
  readonly projects: string[];
  readonly additional_fields: string[];
  readonly cutoff_days?: number;
  readonly request_timeout?: number;
}

interface InstanceConfig {
  instanceUrl: string;
  apiVersion: string;
  graphApiUrl?: string;
  graphApiVersion?: string;
}

interface AzureWorkitemsClient {
  readonly core: ICoreApi;
  readonly wit: IWorkItemTrackingApi;
  readonly graph?: AxiosInstance;
}

export class AzureWorkitems {
  private static azure_Workitems: AzureWorkitems = null;

  constructor(
    private readonly instanceType: InstanceType,
    private readonly apiVersion: string,
    private readonly client: AzureWorkitemsClient,
    private readonly additionalFieldReferences: Map<string, string>,
    private readonly logger: AirbyteLogger
  ) {}

  static async instance(
    config: AzureWorkitemsConfig,
    logger: AirbyteLogger
  ): Promise<AzureWorkitems> {
    if (AzureWorkitems.azure_Workitems) return AzureWorkitems.azure_Workitems;

    AzureWorkitems.validateConfig(config);
    if (config.instance_type.type) {
      logger.info(`Azure DevOps instance type: ${config.instance_type.type}`);
    } else {
      logger.info(
        'No Azure DevOps instance type provided, defaulting to cloud'
      );
    }

    const instanceConfig = AzureWorkitems.getInstanceConfig(config);

    const baseUrl = `${instanceConfig.instanceUrl}/${config.organization}`;
    const apiVersion = instanceConfig.apiVersion ?? DEFAULT_API_VERSION;
    const accessToken = base64Encode(`:${config.access_token}`);

    const timeout = config.request_timeout ?? DEFAULT_REQUEST_TIMEOUT;
    // Graph API is only available in Azure DevOps Cloud
    const graphClient =
      config.instance_type.type === 'cloud'
        ? makeAxiosInstanceWithRetry(
            {
              baseURL: `${DEFAULT_GRAPH_API_URL}/${config.organization}/_apis/graph`,
              timeout,
              maxContentLength: Infinity,
              maxBodyLength: Infinity,
              params: {'api-version': DEFAULT_GRAPH_VERSION},
              headers: {Authorization: `Basic ${accessToken}`},
            },
            logger.asPino(),
            3,
            1000
          )
        : undefined;

    const authHandler = getPersonalAccessTokenHandler(config.access_token);
    const connection = new WebApi(baseUrl, authHandler, {
      socketTimeout: timeout,
      allowRetries: true,
      maxRetries: 3, // Number of retry attempts
      globalAgentOptions: {
        keepAlive: true,
        timeout,
      },
    });

    const witApiClient = await connection.getWorkItemTrackingApi();
    const fieldNameReferences = new Map<string, string>();
    const fields = await witApiClient.getFields();
    for (const field of fields) {
      fieldNameReferences.set(field.name, field.referenceName);
    }

    const additionalFieldReferences = new Map<string, string>();
    const additionalFields =
      config.additional_fields?.filter(Boolean).map((f) => f.trim()) ?? [];

    for (const field of additionalFields) {
      const referenceName = fieldNameReferences.get(field);
      if (referenceName) {
        additionalFieldReferences.set(referenceName, field);
      } else {
        logger.warn(`Field ${field} not found, will not be included`);
      }
    }

    logger.debug(
      `Additional field references: ${JSON.stringify(
        Object.fromEntries(additionalFieldReferences)
      )}`
    );

    const client = {
      core: await connection.getCoreApi(),
      wit: witApiClient,
      graph: graphClient,
    };

    AzureWorkitems.azure_Workitems = new AzureWorkitems(
      config.instance_type,
      apiVersion,
      client,
      additionalFieldReferences,
      logger
    );
    return AzureWorkitems.azure_Workitems;
  }

  static validateConfig(config: AzureWorkitemsConfig) {
    if (!config.access_token) {
      throw new VError('access_token must not be an empty string');
    }

    if (!config.organization) {
      throw new VError('organization must not be an empty string');
    }

    if (config.instance_type.type === 'cloud') {
      return;
    }

    const apiUrl = AzureWorkitems.cleanUrl(config.instance_type.api_url);
    const graphApiUrl = AzureWorkitems.cleanUrl(
      config.instance_type.graph_api_url
    );

    if (!apiUrl) {
      throw new VError(
        'API URL and Graph API URL must be provided when Azure DevOps ' +
          'instance type is Azure DevOps Server'
      );
    }
  }

  static cleanUrl(url?: string): string | undefined {
    return url?.trim().endsWith('/') ? url.trim().slice(0, -1) : url?.trim();
  }

  static getInstanceConfig(config: AzureWorkitemsConfig): InstanceConfig {
    if (config.instance_type.type === 'server') {
      return {
        instanceUrl: config.instance_type.api_url,
        apiVersion: config.instance_type.api_version,
      };
    }
    return {
      instanceUrl: DEFAULT_API_URL,
      apiVersion: DEFAULT_API_VERSION,
      graphApiUrl: DEFAULT_GRAPH_API_URL,
      graphApiVersion: DEFAULT_GRAPH_VERSION,
    };
  }

  async checkConnection(): Promise<void> {
    try {
      // TODO: Fix this
      const iter = this.getUsers([]);
      await iter.next();
    } catch (err: any) {
      let errorMessage = 'Please verify your access token is correct. Error: ';
      if (err.error_code || err.error_info) {
        errorMessage += `${err.error_code}: ${err.error_info}`;
        throw new VError(errorMessage);
      }
      try {
        errorMessage += err.message ?? err.statusText ?? wrapApiError(err);
      } catch (wrapError: any) {
        errorMessage += wrapError.message;
      }
      throw new VError(errorMessage);
    }
  }

  // private get<T = any, R = AxiosResponse<T>>(
  //   path: string,
  //   config?: any
  // ): Promise<R | undefined> {
  //   return this.handleNotFound<T, R>(() =>
  //     this.httpClient.get<T, R>(path, config)
  //   );
  // }

  // TODO: How to use this?
  private async handleNotFound<T = any, R = AxiosResponse<T>>(
    call: () => Promise<R>
  ): Promise<R | undefined> {
    try {
      const res = await call();
      return res;
    } catch (err: any) {
      if (err?.response?.status === 404) {
        return undefined;
      }
      throw err;
    }
  }

  async *getWorkitems(
    project: string,
    projectId: string
  ): AsyncGenerator<WorkItemWithRevisions> {
    const stateCategories = await this.getStateCategories(project);
    const stateCategoriesObj = Object.fromEntries(
      Array.from(stateCategories.entries()).map(([type, states]) => [
        type,
        Object.fromEntries(states),
      ])
    );
    this.logger.debug(
      `State categories: ${JSON.stringify(stateCategoriesObj)}`
    );

    const promises = WORK_ITEM_TYPES.map((type) =>
      this.getIdsFromAWorkItemType(project, type)
    );

    const results = await Promise.all(promises);
    const ids = flatten(results);

    for (const c of chunk(ids, MAX_BATCH_SIZE)) {
      const workitems = await this.client.wit.getWorkItems(
        c,
        undefined,
        undefined,
        WorkItemExpand.All,
        undefined,
        project
      );

      for (const item of workitems ?? []) {
        // TODO: Verify id if defined
        const {revisions} = await this.getWorkItemRevisions(project, item.id);
        const states = stateCategories.get(item.fields['System.WorkItemType']);
        const stateCategory = this.getStateCategory(
          item.fields['System.State'],
          states
        );

        const additionalFields = this.extractAdditionalFields(item.fields);
        const stateRevisions = this.getStateRevisions(states, revisions);
        const assigneeRevisions = this.getAssigneeRevisions(revisions);
        const iterationRevisions = this.getIterationRevisions(revisions);
        yield {
          ...item,
          fields: {
            ...item.fields,
            Faros: {
              WorkItemStateCategory: stateCategory,
            },
          },
          revisions: {
            states: stateRevisions,
            assignees: assigneeRevisions,
            iterations: iterationRevisions,
          },
          additionalFields,
          projectId,
        };
      }
    }
  }

  // TODO: Build generic pagination for all APIs
  private async getWorkItemRevisions(
    project: string,
    id: number
  ): Promise<any> {
    const pageSize = 100; // Number of items per page
    let skip = 0;
    const allRevisions: any[] = [];
    let hasMoreResults = true;

    while (hasMoreResults) {
      const updates = await this.client.wit.getUpdates(
        id,
        pageSize,
        skip,
        project
      );

      if (!Array.isArray(updates) || !updates.length) {
        hasMoreResults = false;
      } else {
        allRevisions.push(...updates);
        skip += pageSize;

        if (pageSize > updates.length) {
          hasMoreResults = false;
        }
      }
    }

    return {revisions: allRevisions};
  }

  private getFieldChanges(
    field: string,
    updates: any[]
  ): {value: any; changedDate: string}[] {
    const changes = [];
    for (const revision of updates ?? []) {
      const fields = revision.fields;
      if (!fields) {
        continue;
      }
      if (fields[field]?.newValue) {
        changes.push({
          value: fields[field]?.newValue,
          changedDate: fields['System.ChangedDate']?.newValue,
        });
      }
    }
    return changes;
  }

  private getStateRevisions(states: Map<string, string>, updates: any): any[] {
    const changes = this.getFieldChanges('System.State', updates);
    return changes.map((change) => ({
      state: this.getStateCategory(change.value, states),
      changedDate: change.changedDate,
    }));
  }

  private getIterationRevisions(updates: any[]): any[] {
    const changes = this.getFieldChanges('System.IterationId', updates);
    return changes.map((change, index) => ({
      iteration: change.value,
      addedAt: change.changedDate,
      removedAt:
        index < changes.length - 1 ? changes[index + 1].changedDate : null,
    }));
  }

  private getStateCategory(
    state: string,
    states: Map<string, string>
  ): {
    name: string;
    category: string;
  } {
    const category = states?.get(state);
    if (!category) {
      this.logger.debug(`Unknown category for state: ${state}`);
    }
    return {
      name: state,
      category,
    };
  }

  private getAssigneeRevisions(updates: any[]): any[] {
    const changes = this.getFieldChanges('System.AssignedTo', updates);
    return changes.map((change) => ({
      assignee: change.value,
      changedDate: change.changedDate,
    }));
  }

  // TODO - Fetch all work items instead of only max 20000
  // Add time precision to the query for incremental sync
  async getIdsFromAWorkItemType(
    project: string,
    workItemsType: string
  ): Promise<ReadonlyArray<number>> {
    const quotedProject = `'${project}'`;
    const data = {
      query:
        'Select [System.Id] From WorkItems WHERE [System.WorkItemType] = ' +
        workItemsType +
        ' AND [System.ChangedDate] >= @Today-180 AND [System.TeamProject] = ' +
        quotedProject +
        ' ORDER BY [System.ChangedDate] DESC',
    };
    // Azure API has a limit of 20000 items per request.
    const result = await this.client.wit.queryByWiql(
      data,
      undefined,
      undefined,
      19999
    );
    return result.workItems.map((workItem) => workItem.id);
  }

  async *getUsers(projects: ReadonlyArray<string>): AsyncGenerator<User> {
    if (this.instanceType?.type === 'server') {
      yield* this.getServerUsers(projects);
      return;
    }
    yield* this.getCloudUsers();
  }

  async *getCloudUsers(): AsyncGenerator<GraphUser> {
    let continuationToken: string;
    do {
      const res = await this.client.graph.get<UserResponse>('users', {
        params: {subjectTypes: 'msa,aad,imp', continuationToken},
      });
      continuationToken = res?.headers?.['X-MS-ContinuationToken'];
      for (const item of res?.data?.value ?? []) {
        yield item;
      }
    } while (continuationToken);
  }

  async *getServerUsers(
    projects?: ReadonlyArray<string>
  ): AsyncGenerator<IdentityRef> {
    const seenUsers = new Set<string>();
    let teams = 0;
    const projectsRes = await this.getProjects(projects);
    for await (const project of projectsRes) {
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
    this.logger.debug(`Fetched members from ${teams} teams`);
  }

  private async *paginateResults<T>(
    fetchPage: (pageSize: number, skip: number) => Promise<T[]>,
    pageSize = 100
  ): AsyncGenerator<T> {
    let skip = 0;
    let hasMoreResults = true;

    while (hasMoreResults) {
      const res = await fetchPage(pageSize, skip);

      for (const item of res ?? []) {
        yield item;
      }

      if (res?.length < pageSize) {
        hasMoreResults = false;
      }
      skip += pageSize;
    }
  }

  async *getTeams(projectId: string): AsyncGenerator<WebApiTeam> {
    const fetchTeams = (pageSize: number, skip: number) =>
      this.client.core.getTeams(projectId, false, pageSize, skip);

    yield* this.paginateResults<WebApiTeam>(fetchTeams);
  }

  async *getTeamMembers(
    projectId: string,
    teamId: string
  ): AsyncGenerator<IdentityRef> {
    const fetchMembers = (pageSize: number, skip: number) =>
      this.client.core.getTeamMembersWithExtendedProperties(
        projectId,
        teamId,
        pageSize,
        skip
      );

    for await (const member of this.paginateResults<TeamMember>(fetchMembers)) {
      yield member.identity;
    }
  }

  /**
   * Retrieves all iterations for a given project in Azure DevOps using
   * iteration hierarchy recursively. Using this instead of teamsettings/iterations
   * since the latter only returns iterations explicitly assigned to a team.
   */
  async *getIterations(
    projectId: string
  ): AsyncGenerator<WorkItemClassificationNode> {
    const iteration = await this.client.wit.getClassificationNode(
      projectId,
      TreeStructureGroup.Iterations,
      undefined, // path
      1 // depth
    );

    if (!iteration) {
      return;
    }

    // Yield root iteration
    yield {
      id: iteration.id,
      identifier: iteration.identifier,
      name: iteration.name,
      path: iteration.path,
      attributes: iteration.attributes,
      hasChildren: iteration.hasChildren,
      url: iteration.url,
    };

    // Process children recursively
    yield* this.processIterationChildren(projectId, iteration);
  }

  private async *processIterationChildren(
    projectId: string,
    node: WorkItemClassificationNode
  ): AsyncGenerator<WorkItemClassificationNode> {
    if (!node.children) {
      return;
    }

    for (const child of node.children) {
      yield child;

      if (child.hasChildren) {
        const iteration = await this.client.wit.getClassificationNodes(
          projectId,
          [child.id],
          1
        );
        if (iteration?.length) {
          // This should only have one iteration
          yield* this.processIterationChildren(projectId, iteration[0]);
        } else {
          this.logger.warn(
            `Failed to fetch iteration for ${child.id} ${child.name} to get children`
          );
        }
      }
    }
  }

  // TODO: Memoize this
  async getProjects(
    projects: ReadonlyArray<string>
  ): Promise<ReadonlyArray<TeamProject>> {
    if (projects?.length) {
      const allProjects = [];
      for (const project of projects ?? []) {
        const res = await this.getProject(project);
        if (res) {
          allProjects.push(res);
        } else {
          this.logger.warn(`Project ${project} not found`);
        }
      }
      return allProjects;
    }
    return await this.getAllProjects();
  }

  private async getProject(project: string): Promise<TeamProject> {
    return await this.client.core.getProject(project);
  }

  private async getAllProjects(): Promise<ReadonlyArray<TeamProjectReference>> {
    const allProjects = [];
    let continuationToken;

    // TODO: Generalize pagination for this
    do {
      const res = await this.client.core.getProjects(
        'wellFormed',
        100,
        undefined,
        continuationToken
      );

      for (const project of res.values()) {
        allProjects.push(project);
      }
      continuationToken = res.continuationToken;
    } while (continuationToken);

    return allProjects;
  }

  private async getStateCategories(
    project: string
  ): Promise<Map<string, Map<string, string>>> {
    const stateCategories = new Map<string, Map<string, string>>();

    await Promise.all(
      WORK_ITEM_TYPES.map(async (type) => {
        const cleanType = type.replace(/'/g, '');
        const states = await this.client.wit.getWorkItemTypeStates(
          project,
          cleanType
        );
        const typeCategories = new Map<string, string>();
        for (const state of states) {
          typeCategories.set(state.name, state.category);
        }
        stateCategories.set(cleanType, typeCategories);
      })
    );

    return stateCategories;
  }

  private extractAdditionalFields(fields?: {
    [key: string]: any;
  }): ReadonlyArray<AdditionalField> {
    const additionalFields = [];
    if (!fields) {
      return additionalFields;
    }

    for (const [key, value] of this.additionalFieldReferences) {
      if (fields[key]) {
        additionalFields.push({name: value, value: fields[key]});
      }
    }
    return additionalFields;
  }
}
