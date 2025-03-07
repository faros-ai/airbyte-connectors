import {AxiosInstance, AxiosResponse} from 'axios';
import {AirbyteLogger, base64Encode, wrapApiError} from 'faros-airbyte-cdk';
import {makeAxiosInstanceWithRetry} from 'faros-js-client';
import {chunk, flatten} from 'lodash';
import {VError} from 'verror';

import {
  AdditionalField,
  AzureInstanceType,
  AzureWorkitemsConfig,
  User,
  UserResponse,
  WorkItemAssigneeRevision,
  WorkItemIterationRevision,
  WorkItemRevisions,
  WorkItemState,
  WorkItemStateRevision,
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
  WorkItemUpdate,
} from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';
import {IdentityRef} from 'azure-devops-node-api/interfaces/common/VSSInterfaces';
import {GraphUser} from 'azure-devops-node-api/interfaces/GraphInterfaces';
import {Memoize} from 'typescript-memoize';

const CLOUD_API_URL = 'https://dev.azure.com';
const DEFAULT_GRAPH_API_URL = 'https://vssps.dev.azure.com';
const DEFAULT_GRAPH_VERSION = '7.1-preview.1';
const MAX_BATCH_SIZE = 200;
const DEFAULT_REQUEST_TIMEOUT = 300_000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_PAGE_SIZE = 100;

// Curated list of work item types from Azure DevOps
// https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/work-item-types/list
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

interface AzureWorkitemsClient {
  readonly core: ICoreApi;
  readonly wit: IWorkItemTrackingApi;
  readonly graph?: AxiosInstance;
}

export class AzureWorkitems {
  private static azure_Workitems: AzureWorkitems = null;

  constructor(
    private readonly client: AzureWorkitemsClient,
    private readonly instanceType: AzureInstanceType,
    private readonly additionalFieldReferences: Map<string, string>,
    private readonly top: number,
    private readonly logger: AirbyteLogger
  ) {}

  static async instance(
    config: AzureWorkitemsConfig,
    logger: AirbyteLogger
  ): Promise<AzureWorkitems> {
    if (AzureWorkitems.azure_Workitems) return AzureWorkitems.azure_Workitems;

    if (config.instance_type.type) {
      logger.info(`Azure DevOps instance type: ${config.instance_type.type}`);
    } else {
      logger.info(
        'No Azure DevOps instance type provided, defaulting to cloud'
      );
    }

    AzureWorkitems.validateConfig(config);

    const apiUrl =
      config.instance_type.type === 'server'
        ? config.instance_type.api_url
        : CLOUD_API_URL;

    const baseUrl = `${apiUrl}/${config.organization}`;
    const accessToken = base64Encode(`:${config.access_token}`);

    const timeout = config.request_timeout ?? DEFAULT_REQUEST_TIMEOUT;
    const maxRetries = config.max_retries ?? DEFAULT_MAX_RETRIES;
    // Graph API is only available in Azure DevOps Cloud for users, groups, and group memberships
    // https://learn.microsoft.com/en-us/rest/api/azure/devops/graph
    const graphClient =
      config.instance_type.type !== 'server'
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
            maxRetries,
            1000
          )
        : undefined;

    // Create Azure DevOps API client
    const authHandler = getPersonalAccessTokenHandler(config.access_token);
    const connection = new WebApi(baseUrl, authHandler, {
      socketTimeout: timeout,
      allowRetries: true,
      maxRetries,
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
      client,
      config.instance_type,
      additionalFieldReferences,
      config.page_size ?? DEFAULT_PAGE_SIZE,
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

    // Validate Server instance URL
    try {
      new URL(config.instance_type.api_url.trim());
    } catch (error) {
      throw new VError(`Invalid URL: ${config.instance_type.api_url}`);
    }
  }

  async checkConnection(): Promise<void> {
    try {
      // TODO: Fix this
      const iter = this.getUsers();
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

  private async *getPaginated<T>(
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
        const states = stateCategories.get(item.fields['System.WorkItemType']);
        const stateCategory = this.getStateCategory(
          item.fields['System.State'],
          states
        );

        const additionalFields = this.extractAdditionalFields(item.fields);
        const revisions = await this.getWorkItemRevisions(
          item.id,
          project,
          states
        );
        yield {
          ...item,
          fields: {
            ...item.fields,
            Faros: {
              WorkItemStateCategory: stateCategory,
            },
          },
          revisions,
          additionalFields,
          projectId,
        };
      }
    }
  }

  private async getWorkItemRevisions(
    id: number,
    project: string,
    states: Map<string, string>
  ): Promise<WorkItemRevisions> {
    const updates = await this.getWorkItemUpdates(id, project);

    return {
      states: this.getStateRevisions(states, updates),
      assignees: this.getAssigneeRevisions(updates),
      iterations: this.getIterationRevisions(updates),
    };
  }

  private async getWorkItemUpdates(
    id: number,
    project: string
  ): Promise<ReadonlyArray<WorkItemUpdate>> {
    const getUpdatesFn = (top: number, skip: number) =>
      this.client.wit.getUpdates(id, top, skip, project);

    const updates = [];
    for await (const update of this.getPaginated(getUpdatesFn)) {
      updates.push(update);
    }
    return updates;
  }

  private getFieldChanges(
    field: string,
    updates: ReadonlyArray<WorkItemUpdate>
  ): {value: any; changedDate: string}[] {
    const changes = [];
    for (const update of updates ?? []) {
      const fields = update.fields;
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

  private getStateRevisions(
    states: Map<string, string>,
    updates: ReadonlyArray<WorkItemUpdate>
  ): ReadonlyArray<WorkItemStateRevision> {
    const changes = this.getFieldChanges('System.State', updates);
    return changes.map((change) => ({
      state: this.getStateCategory(change.value, states),
      changedDate: change.changedDate,
    }));
  }

  private getIterationRevisions(
    updates: ReadonlyArray<WorkItemUpdate>
  ): ReadonlyArray<WorkItemIterationRevision> {
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
  ): WorkItemState {
    const category = states?.get(state);
    if (!category) {
      this.logger.debug(`Unknown category for state: ${state}`);
    }
    return {
      name: state,
      category,
    };
  }

  private getAssigneeRevisions(
    updates: ReadonlyArray<WorkItemUpdate>
  ): ReadonlyArray<WorkItemAssigneeRevision> {
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
      true, // time precision
      19999
    );
    return result.workItems.map((workItem) => workItem.id);
  }

  async *getUsers(projects?: ReadonlyArray<string>): AsyncGenerator<User> {
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
    this.logger.debug(`Fetched members from ${teams} teams`);
  }

  async *getTeams(projectId: string): AsyncGenerator<WebApiTeam> {
    const getTeamsFn = (pageSize: number, skip: number) =>
      this.client.core.getTeams(projectId, false, pageSize, skip);

    yield* this.getPaginated<WebApiTeam>(getTeamsFn);
  }

  async *getTeamMembers(
    projectId: string,
    teamId: string
  ): AsyncGenerator<IdentityRef> {
    const getMembersFn = (top: number, skip: number) =>
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

  @Memoize()
  async getProjects(
    projects?: ReadonlyArray<string>
  ): Promise<ReadonlyArray<TeamProject>> {
    if (!projects?.length) {
      return await this.getAllProjects();
    }

    const allProjects = [];
    for (const project of projects) {
      const res = await this.getProject(project);
      if (res) {
        allProjects.push(res);
      } else {
        this.logger.warn(`Project ${project} in config not found. Skipping`);
      }
    }
    return allProjects;
  }

  private async getProject(project: string): Promise<TeamProject> {
    return await this.client.core.getProject(project);
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
