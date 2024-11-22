import axios, {AxiosInstance, AxiosResponse} from 'axios';
import {base64Encode, wrapApiError} from 'faros-airbyte-cdk';
import {makeAxiosInstanceWithRetry} from 'faros-js-client';
import {chunk, flatten} from 'lodash';
import {VError} from 'verror';

import {User, UserResponse, WorkItemResponse} from './models';
const DEFAULT_API_VERSION = '7.0';
const DEFAULT_GRAPH_VERSION = '7.1-preview.1';
const MAX_BATCH_SIZE = 200;
export const DEFAULT_REQUEST_TIMEOUT = 60000;

export interface AzureWorkitemsConfig {
  readonly access_token: string;
  readonly organization: string;
  readonly project: string;
  readonly api_version?: string;
  readonly request_timeout?: number;
  readonly graph_version?: string;
}

export class AzureWorkitems {
  private static azure_Workitems: AzureWorkitems = null;

  constructor(
    private readonly httpClient: AxiosInstance,
    private readonly graphClient: AxiosInstance
  ) {}

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

    const accessToken = base64Encode(`:${config.access_token}`);

    const version = config.api_version ?? DEFAULT_API_VERSION;

    const httpClient = makeAxiosInstanceWithRetry(
      {
        baseURL: `https://dev.azure.com/${config.organization}/${config.project}/_apis`,
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

    const graphClient = axios.create({
      baseURL: `https://vssps.dev.azure.com/${config.organization}/_apis/graph`,
      timeout: config.request_timeout ?? DEFAULT_REQUEST_TIMEOUT,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      params: {'api-version': config.graph_version ?? DEFAULT_GRAPH_VERSION},
      headers: {Authorization: `Basic ${accessToken}`},
    });

    AzureWorkitems.azure_Workitems = new AzureWorkitems(
      httpClient,
      graphClient
    );
    return AzureWorkitems.azure_Workitems;
  }

  async checkConnection(): Promise<void> {
    try {
      await this.getIdsFromAWorkItemType('Task');
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
  private post<T = any, R = AxiosResponse<T>>(
    path: string,
    data: any
  ): Promise<R | undefined> {
    return this.handleNotFound<T, R>(() =>
      this.httpClient.post<T, R>(path, data)
    );
  }

  async *getStories(): AsyncGenerator<any> {
    const data = {
      query:
        "Select [System.Id], [System.Title], [System.State] From WorkItems Where [System.WorkItemType] = 'User Story' order by [id] asc",
    };
    const list = await this.post<any>('wit/wiql', data);
    const ids: string[] = [];
    for (let i = 0; i < list.data.workItems.length; i++) {
      ids.push(list.data.workItems[i].id);
    }
    const ids2: string[] = [];
    const userStories = [];
    for (const id of ids) {
      if (ids2.length == MAX_BATCH_SIZE) {
        userStories.push(
          await this.get<WorkItemResponse>(
            `wit/workitems?ids=${ids2}&$expand=all`
          )
        );
        ids2.splice(0);
      }
      ids2.push(id);
    }
    if (ids2.length > 0) {
      userStories.push(
        await this.get<WorkItemResponse>(
          `wit/workitems?ids=${ids2}&$expand=all`
        )
      );
    }
    for (const item of userStories) {
      yield item;
    }
  }

  async *getWorkitems(): AsyncGenerator<any> {
    const promises = [
      "'Task'",
      "'User Story'",
      "'BUG'",
      "'Feature'",
      "'Epic'",
      "'Issue'",
      "'Product Backlog Item'",
      "'Requirement'",
    ].map((n) => this.getIdsFromAWorkItemType(n));

    const results = await Promise.all(promises);
    const ids: ReadonlyArray<string> = flatten(results);

    for (const c of chunk(ids, MAX_BATCH_SIZE)) {
      const res = await this.get<WorkItemResponse>(
        `wit/workitems?ids=${c}&$expand=all`
      );
      for (const item of res?.data?.value ?? []) {
        yield item;
      }
    }
  }

  async getIdsFromAWorkItemType(
    workItemsType: string
  ): Promise<ReadonlyArray<string>> {
    const data = {
      query:
        'Select [System.Id] From WorkItems WHERE [System.WorkItemType] = ' +
        workItemsType +
        ' order by [id] asc',
    };
    const list = await this.post<any>('wit/wiql', data);
    const ids = [];
    for (let i = 0; i < list.data.workItems.length; i++) {
      ids.push(list.data.workItems[i].id);
    }
    return ids;
  }

  async *getUsers(): AsyncGenerator<User> {
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

  async *getIterations(): AsyncGenerator<any> {
    const res = await this.get<any>('work/teamsettings/iterations');
    let response;
    let response2;
    for (const item of res.data?.value ?? []) {
      response = await this.httpClient.get(item?.url);
      response2 = await this.httpClient.get(
        response?.data?._links?.classificationNode.href
      );
      if (typeof response2?.data?.id !== 'undefined') {
        item.id = response2.data?.id;
      }
      yield item;
    }
  }

  async *getBoards(): AsyncGenerator<any> {
    const res = await this.get<any>('work/boards');
    for (const item of res.data?.value ?? []) {
      yield item;
    }
  }
}
