import axios, { Axios, AxiosInstance, AxiosResponse } from 'axios';
import { wrapApiError } from 'faros-airbyte-cdk';
import { VError } from 'verror';

import {
  WorkItem,
  WorkItemResponse,
} from './models';
const DEFAULT_API_VERSION = '6.0';

export interface AzureWorkitemsConfig {
  readonly access_token: string;
  readonly organization: string;
  readonly project: string;
  readonly api_version?: string;
  readonly graph_version?: string;
}

export class AzureWorkitems {
  private static azure_Workitems: AzureWorkitems = null;

  constructor(
    private readonly httpClient: AxiosInstance,
  ) { }

  static async instance(config: AzureWorkitemsConfig): Promise<AzureWorkitems> {
    if (AzureWorkitems.azure_Workitems) return AzureWorkitems.azure_Workitems;

    if (!config.access_token) {
      throw new VError('access_token must not be an empty string');
    }

    if (!config.organization) {
      throw new VError('organization must not be an empty string');
    }

    if (!config.project) {
      throw new VError('project must not be an empty string');
    }

    const version = config.api_version ?? DEFAULT_API_VERSION;
    const httpClient = axios.create({
      baseURL: `https://dev.azure.com/${config.organization}/${config.project}/_apis`,
      timeout: 15000, // default is `0` (no timeout)
      maxContentLength: Infinity, //default is 2000 bytes
      params: {
        'api-version': version,
      },
      headers: {
        Authorization: `Basic ${config.access_token}`,
      },
    });


    AzureWorkitems.azure_Workitems = new AzureWorkitems(httpClient);
    return AzureWorkitems.azure_Workitems;
  }

  async checkConnection(): Promise<void> {
    try {
      const iter = this.getStories();
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
    path: string
  ): Promise<R | undefined> {
    return this.handleNotFound<T, R>(() => this.httpClient.get<T, R>(path));
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
  private post<T = any, R = AxiosResponse<T>>(path: string, data: any): Promise<R | undefined> {

    return this.handleNotFound<T, R>(() => this.httpClient.post<T, R>(path, data));
  }

  async *getStories(): AsyncGenerator<any> {
    const data = { query: "Select [System.Id], [System.Title], [System.State] From WorkItems Where [System.WorkItemType] = 'User Story' order by [id] asc" };
    const list = await this.post<any>('wit/wiql', data);
    let ids: string[] = [];
    for (let i = 0; i < list.data.workItems.length; i++) {
      ids.push(list.data.workItems[i].id);
    }
    let ids2: string[] = [];
    let userStories = [];
    for (const id of ids) {
      if (ids2.length == 200) {
        userStories.push(await this.get<WorkItemResponse>(`wit/workitems?ids=${ids2}&$expand=all`));
        ids2.splice(0);
      }
      ids2.push(id);
    }
    if (ids2.length > 0) {
      userStories.push(await this.get<WorkItemResponse>(`wit/workitems?ids=${ids2}&$expand=all`));
    }
  }

  getRelatedWorkitems(workItems:WorkItemResponse, relatedTo:WorkItem): WorkItem[]{

    const items = workItems.value;
    return items
      .filter((item) => item.fields.System.parent !== null)
      .filter((item) => item.fields.System.parent === relatedTo.id);
  }

  async *getWorkitems(): AsyncGenerator<any> {
    const data = { query: "Select [System.Id], [System.Title], [System.State] From WorkItems WHERE [System.WorkItemType] = 'Task' OR [System.WorkItemType] = 'User Story' OR [System.WorkItemType] = 'BUG' order by [id] asc" };
    const list = await this.post<any>('wit/wiql', data);
    let ids: string[] = [];
    for (let i = 0; i < list.data.workItems.length; i++) {
      ids.push(list.data.workItems[i].id);
    }
    let ids2: string[] = [];
    let workitems = [];
    for (const id of ids) {
      if (ids2.length == 200) {
        workitems.push(await this.get<WorkItemResponse>(`wit/workitems?ids=${ids2}&$expand=all`));
        ids2.splice(0);
      }
      ids2.push(id);
    }
    if (ids2.length > 0) {
      workitems.push(await this.get<WorkItemResponse>(`wit/workitems?ids=${ids2}&$expand=all`));
    }

    for (const array of workitems) {
      for (const item of array?.data?.value ?? []) {
        console.log(item);
        yield item;
      }
    }
  }
}
