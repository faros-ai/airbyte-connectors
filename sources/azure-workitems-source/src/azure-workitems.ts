import axios, {AxiosInstance, AxiosResponse} from 'axios';
import {AirbyteLogger, base64Encode, wrapApiError} from 'faros-airbyte-cdk';
import {makeAxiosInstanceWithRetry} from 'faros-js-client';
import {chunk, flatten} from 'lodash';
import {VError} from 'verror';

import {
  AdditionalField,
  fields,
  Project,
  User,
  UserResponse,
  WorkItem,
  WorkItemResponse,
  WorkItemUpdatesResponse,
} from './models';

const DEFAULT_API_URL = 'https://dev.azure.com';
const DEFAULT_API_VERSION = '7.1';
const DEFAULT_GRAPH_API_URL = 'https://vssps.dev.azure.com';
const DEFAULT_GRAPH_VERSION = '7.1-preview.1';
const MAX_BATCH_SIZE = 200;
export const DEFAULT_REQUEST_TIMEOUT = 60000;

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

export type InstanceType = {
  type: 'cloud' | 'server';
};

export interface AzureWorkitemsConfig {
  readonly instance_type?: InstanceType;
  readonly access_token: string;
  readonly api_url: string;
  readonly graph_api_url: string;
  readonly organization: string;
  readonly project: string;
  readonly projects: string[];
  readonly additional_fields: string[];
  readonly cutoff_days?: number;
  readonly api_version?: string;
  readonly graph_version?: string;
  readonly request_timeout?: number;
}

export class AzureWorkitems {
  private static azure_Workitems: AzureWorkitems = null;

  constructor(
    private readonly instanceType: InstanceType,
    private readonly httpClient: AxiosInstance,
    private readonly graphClient: AxiosInstance,
    private readonly additionalFieldReferences: Map<string, string>,
    private readonly logger: AirbyteLogger
  ) {}

  static async instance(
    config: AzureWorkitemsConfig,
    logger: AirbyteLogger
  ): Promise<AzureWorkitems> {
    if (AzureWorkitems.azure_Workitems) return AzureWorkitems.azure_Workitems;

    AzureWorkitems.validateConfig(config);

    const apiUrl = AzureWorkitems.cleanUrl(config.api_url) ?? DEFAULT_API_URL;
    const version = config.api_version ?? DEFAULT_API_VERSION;
    const accessToken = base64Encode(`:${config.access_token}`);

    const httpClient = makeAxiosInstanceWithRetry(
      {
        baseURL: `${apiUrl}/${config.organization}`,
        timeout: config.request_timeout ?? DEFAULT_REQUEST_TIMEOUT,
        maxContentLength: Infinity, //default is 2000 bytes
        params: {
          'api-version': version,
        },
        headers: {
          Authorization: `Basic ${accessToken}`,
        },
      },
      undefined,
      3,
      1000
    );

    const graphApiUrl =
      AzureWorkitems.cleanUrl(config.graph_api_url) ?? DEFAULT_GRAPH_API_URL;

    const graphClient = axios.create({
      baseURL: `${graphApiUrl}/${config.organization}/_apis/graph`,
      timeout: config.request_timeout ?? DEFAULT_REQUEST_TIMEOUT,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      params: {'api-version': config.graph_version ?? DEFAULT_GRAPH_VERSION},
      headers: {Authorization: `Basic ${accessToken}`},
    });

    const fieldNameReferences = new Map<string, string>();
    const res = await httpClient.get<any>(`_apis/wit/fields`);
    for (const item of res.data?.value ?? []) {
      fieldNameReferences.set(item.name, item.referenceName);
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

    AzureWorkitems.azure_Workitems = new AzureWorkitems(
      config.instance_type,
      httpClient,
      graphClient,
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

    // If using a custom API URL for Server, a custom Graph API URL must also be provided
    const apiUrl = AzureWorkitems.cleanUrl(config.api_url) ?? DEFAULT_API_URL;
    const graphApiUrl =
      AzureWorkitems.cleanUrl(config.graph_api_url) ?? DEFAULT_GRAPH_API_URL;

    if (apiUrl !== DEFAULT_API_URL && graphApiUrl === DEFAULT_GRAPH_API_URL) {
      throw new VError(
        'When using a custom API URL, a custom Graph API URL must also be provided'
      );
    }
  }

  static cleanUrl(url?: string): string | undefined {
    return url?.trim().endsWith('/') ? url.trim().slice(0, -1) : url?.trim();
  }

  async checkConnection(): Promise<void> {
    try {
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

  private get<T = any, R = AxiosResponse<T>>(
    path: string,
    config?: any
  ): Promise<R | undefined> {
    return this.handleNotFound<T, R>(() =>
      this.httpClient.get<T, R>(path, config)
    );
  }

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
  private post<T = any, R = AxiosResponse<T>>(
    path: string,
    data: any,
    params?: any
  ): Promise<R | undefined> {
    return this.handleNotFound<T, R>(() =>
      this.httpClient.post<T, R>(path, data, {params})
    );
  }

  async *getWorkitems(
    project: string,
    projectId: string
  ): AsyncGenerator<WorkItem> {
    const stateCategories = await this.getStateCategories(project);

    const promises = WORK_ITEM_TYPES.map((type) =>
      this.getIdsFromAWorkItemType(project, type)
    );

    const results = await Promise.all(promises);
    const ids: ReadonlyArray<string> = flatten(results);

    for (const c of chunk(ids, MAX_BATCH_SIZE)) {
      const res = await this.get<WorkItemResponse>(
        `${project}/_apis/wit/workitems?ids=${c}&$expand=all`
      );
      for (const item of res?.data?.value ?? []) {
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

  async getWorkItemRevisions(project: string, id: string): Promise<any> {
    const pageSize = 100; // Number of items per page
    let skip = 0;
    const allRevisions: any[] = [];
    let hasMoreResults = true;

    while (hasMoreResults) {
      const url = `${project}/_apis/wit/workitems/${id}/updates?$top=${pageSize}&$skip=${skip}`;
      const response = await this.get<WorkItemUpdatesResponse>(url);

      const data = response?.data;

      const updates = data?.value;
      if (!Array.isArray(updates) || !updates.length) {
        hasMoreResults = false;
      } else {
        allRevisions.push(...updates);
        skip += pageSize;

        if (allRevisions.length >= data?.count) {
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
  async getIdsFromAWorkItemType(
    project: string,
    workItemsType: string
  ): Promise<ReadonlyArray<string>> {
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
    const list = await this.post<any>(`${project}/_apis/wit/wiql`, data, {
      $top: 19999,
    });
    const ids = [];
    for (let i = 0; i < list.data?.workItems?.length; i++) {
      ids.push(list.data.workItems[i].id);
    }
    return ids;
  }

  async *getUsers(): AsyncGenerator<User> {
    if (this.instanceType.type === 'cloud') {
      yield* this.getCloudUsers();
    } else {
      yield* this.getServerUsers();
    }
  }

  async *getCloudUsers(): AsyncGenerator<User> {
    let continuationToken: string;
    do {
      const res = await this.graphClient.get<UserResponse>('users', {
        params: {subjectTypes: 'msa,aad,imp', continuationToken},
      });
      continuationToken = res.headers?.['X-MS-ContinuationToken'];
      for (const item of res.data?.value ?? []) {
        yield item;
      }
    } while (continuationToken);
  }

  async *getServerUsers(): AsyncGenerator<User> {
    const teams = await this.getTeams();

    for (const team of teams) {
      const teamMembers = await this.getTeamMembers(team);
      for (const member of teamMembers) {
        yield member;
      }
    }
  }

  async getTeams(): Promise<ReadonlyArray<any>> {
    const pageSize = 100; // Number of items per page
    let skip = 0;
    const allTeams: any[] = [];
    let hasMoreResults = true;

    while (hasMoreResults) {
      const url = `_apis/teams?$top=${pageSize}&$skip=${skip}`;
      const response = await this.get<any>(url);
      const data = response?.data;

      const teams = data?.value;
      if (!Array.isArray(teams) || !teams.length) {
        hasMoreResults = false;
      } else {
        allTeams.push(...teams);
        skip += pageSize;

        if (teams.length < pageSize) {
          hasMoreResults = false;
        }
      }
    }

    return allTeams;
  }

  async *getTeamMembers(team: any): AsyncGenerator<User> {
    const pageSize = 100; // Number of items per page
    let skip = 0;
    let hasMoreResults = true;

    while (hasMoreResults) {
      const url = `${team.url}/members?$top=${pageSize}&$skip=${skip}`;
      const res = await this.get<any>(url);
      for (const item of res.data?.value ?? []) {
        yield item.identity;
      }

      const count = res.data?.count;
      if (!count || count < pageSize) {
        hasMoreResults = false;
      } else {
        skip += pageSize;
      }
    }
  }

  /**
   * Retrieves all iterations for a given project in Azure DevOps using
   * iteration hierarchy recursively. Using this instead of teamsettings/iterations
   * since the latter only returns iterations explicitly assigned to a team.
   */
  async *getIterations(projectId: string): AsyncGenerator<any> {
    const {data: iteration} = await this.get<any>(
      `${projectId}/_apis/wit/classificationnodes/Iterations`,
      {
        params: {$depth: 1},
      }
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
    yield* this.processIterationChildren(iteration);
  }

  private async *processIterationChildren(node: any): AsyncGenerator<any> {
    if (!node.children) {
      return;
    }

    for (const child of node.children) {
      yield child;

      if (child.hasChildren) {
        const res = await this.get<any>(child.url, {
          params: {$depth: 1},
        });
        if (res?.data) {
          yield* this.processIterationChildren(res.data);
        }
      }
    }
  }

  async *getBoards(project: string): AsyncGenerator<any> {
    const res = await this.get<any>(`${project}/_apis/work/boards`);
    for (const item of res.data?.value ?? []) {
      yield item;
    }
  }

  async getProjects(
    projects: ReadonlyArray<string>
  ): Promise<ReadonlyArray<Project>> {
    if (projects?.length) {
      const allProjects: Project[] = [];
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

  private async getProject(project: string): Promise<Project> {
    const res = await this.get<any>(`_apis/projects/${project}`);
    return res?.data;
  }

  private async getAllProjects(): Promise<Project[]> {
    const allProjects: Project[] = [];
    let continuationToken: string | undefined;

    do {
      const res = await this.get<any>('_apis/projects', {
        params: {
          continuationToken,
          $top: 100, // Number of items per page
        },
      });

      for (const item of res?.data?.value ?? []) {
        allProjects.push(item);
      }

      // Get continuation token from response headers
      continuationToken = res?.headers?.['X-MS-ContinuationToken'];
    } while (continuationToken);

    return allProjects;
  }

  private async getStateCategories(
    project: string
  ): Promise<Map<string, Map<string, string>>> {
    const stateCategories = new Map<string, Map<string, string>>();
    const knownCategories = [
      'Proposed',
      'InProgress',
      'Resolved',
      'Completed',
      'Removed',
    ];
    await Promise.all(
      WORK_ITEM_TYPES.map(async (type) => {
        const cleanType = type.replace(/'/g, '');
        const res = await this.get<any>(
          `${project}/_apis/wit/workitemtypes/${cleanType}/states`
        );
        const values = res.data?.value;
        const typeCategories = new Map<string, string>();
        for (const value of values) {
          typeCategories.set(value.name, value.category);
          if (!knownCategories.includes(value.category)) {
            this.logger.warn(
              `Unknown state category: ${value.category} for type: ${cleanType} in project: ${project}`
            );
          }
        }
        stateCategories.set(cleanType, typeCategories);
      })
    );
    return stateCategories;
  }

  private extractAdditionalFields(
    fields: fields
  ): ReadonlyArray<AdditionalField> {
    const additionalFields = [];
    for (const [key, value] of this.additionalFieldReferences) {
      if (fields[key]) {
        additionalFields.push({name: value, value: fields[key]});
      }
    }
    return additionalFields;
  }
}
