import axios, {AxiosError, AxiosInstance, AxiosResponse} from 'axios';
import axiosRetry, {
  IAxiosRetryConfig,
  isIdempotentRequestError,
} from 'axios-retry';
import {chunk, flatten} from 'lodash';
import {DateTime} from 'luxon';
import {VError} from 'verror';

import {
  AirbyteLogger,
  base64Encode,
  wrapApiError,
} from '../../../faros-airbyte-cdk/lib';
import {
  Board,
  CustomWorkItem,
  User,
  UserResponse,
  WorkItemResponse1,
  WorkItemResponse2,
} from './models';
import {isRetryAllowed} from './utils';
const DEFAULT_API_VERSION = '7.0';
const DEFAULT_GRAPH_VERSION = '7.1-preview.1';
const MAX_BATCH_SIZE = 200;
export const DEFAULT_CUTOFF_DAYS = 90;
export const DEFAULT_REQUEST_TIMEOUT = 60000;
export const DEFAULT_MAX_RETRIES = 5;

export interface AzureWorkitemsConfig {
  readonly access_token: string;
  readonly organization: string;
  readonly projects: string[];
  readonly api_version?: string;
  readonly request_timeout?: number;
  readonly graph_version?: string;
  readonly cutoff_days?: number;
}

export class AzureWorkitems {
  private static azure_Workitems: AzureWorkitems = null;

  constructor(
    private readonly httpClient: AxiosInstance,
    private readonly graphClient: AxiosInstance,
    private readonly cutoffDays: number,
    private projects: string[],
    private readonly logger: AirbyteLogger
  ) {}

  static async instance(
    config: AzureWorkitemsConfig,
    logger: AirbyteLogger
  ): Promise<AzureWorkitems> {
    if (AzureWorkitems.azure_Workitems) return AzureWorkitems.azure_Workitems;

    if (!config.access_token) {
      throw new VError('access_token must not be an empty string');
    }

    if (!config.organization) {
      throw new VError('organization must not be an empty string');
    }

    if (config.projects.length === 0) {
      throw new VError('projects must not be an empty string');
    }

    const cutoffDays = config.cutoff_days ?? DEFAULT_CUTOFF_DAYS;
    const maxRetries = DEFAULT_MAX_RETRIES;

    const accessToken = base64Encode(`:${config.access_token}`);

    const version = config.api_version ?? DEFAULT_API_VERSION;
    const httpClient = axios.create({
      baseURL: `https://dev.azure.com/${config.organization}`,
      timeout: config.request_timeout ?? DEFAULT_REQUEST_TIMEOUT,
      maxContentLength: Infinity, //default is 2000 bytes
      params: {
        'api-version': version,
      },
      headers: {
        Authorization: `Basic ${accessToken}`,
      },
    });

    const graphClient = axios.create({
      baseURL: `https://vssps.dev.azure.com/${config.organization}/_apis/graph`,
      timeout: config.request_timeout ?? DEFAULT_REQUEST_TIMEOUT,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      params: {'api-version': config.graph_version ?? DEFAULT_GRAPH_VERSION},
      headers: {Authorization: `Basic ${accessToken}`},
    });

    const isNetworkError = (error): boolean => {
      return (
        !error.response &&
        Boolean(error.code) && // Prevents retrying cancelled requests
        isRetryAllowed(error) // Prevents retrying unsafe errors
      );
    };
    const retryCondition = (error: AxiosError): boolean => {
      return isNetworkError(error) || isIdempotentRequestError(error);
    };

    const retryConfig: IAxiosRetryConfig = {
      retryDelay: axiosRetry.exponentialDelay,
      shouldResetTimeout: true,
      retries: maxRetries,
      retryCondition,
      onRetry(retryCount, error, requestConfig) {
        logger.info(
          `Retrying request ${requestConfig.url} due to an error: ${error.message} ` +
            `(attempt ${retryCount} of ${maxRetries})`
        );
      },
    };

    axiosRetry(httpClient, retryConfig);
    axiosRetry(graphClient, retryConfig);

    AzureWorkitems.azure_Workitems = new AzureWorkitems(
      httpClient,
      graphClient,
      cutoffDays,
      config.projects ?? [],
      logger
    );
    return AzureWorkitems.azure_Workitems;
  }

  //TODO: Check connection does nothing once you import the source to a conector and click Test Connection button on UI
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
  private post<T = any, R = AxiosResponse<T>>(
    path: string,
    data: any
  ): Promise<R | undefined> {
    return this.handleNotFound<T, R>(() =>
      this.httpClient.post<T, R>(path, data)
    );
  }

  async *getStories(): AsyncGenerator<any> {
    // const data = {
    //   query:
    //     "Select [System.Id], [System.Title], [System.State] From WorkItems Where [System.WorkItemType] = 'User Story' order by [id] asc",
    // };
    const cutoffDate = DateTime.now().minus({days: this.cutoffDays});
    const cutoffDateFormatted = cutoffDate.toFormat('MM-dd-yyyy');
    const userStories = [];
    for (const project of this.projects) {
      const data = {
        query: `Select [System.Id], [System.Title], [System.State] From WorkItems 
           Where [System.WorkItemType] = 'User Story' 
           AND  [System.TeamProject] = '${project}'
           AND [System.CreatedDate] > '${cutoffDateFormatted}'
           order by [id] asc`,
      };
      const ids: string[] = [];
      const ids2: string[] = [];
      const list = await this.post<any>(`${project}/_apis/wit/wiql`, data);
      for (let i = 0; i < list.data.workItems.length; i++) {
        ids.push(list.data.workItems[i].id);
      }
      for (const id of ids) {
        if (ids2.length == MAX_BATCH_SIZE) {
          userStories.push(
            await this.get<WorkItemResponse1>(
              `${project}/_apis/wit/workitems?ids=${ids2}&$expand=all`
            )
          );
          ids2.splice(0);
        }
        ids2.push(id);
      }
      if (ids2.length > 0) {
        yield await this.get<WorkItemResponse1>(
          `${project}/_apis/wit/workitems?ids=${ids2}&$expand=all`
        );
      }
    }
  }

  async *getWorkitems(): AsyncGenerator<CustomWorkItem> {
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
    const itemsArray: any[] = [];
    for (const project of this.projects) {
      for (const c of chunk(ids, MAX_BATCH_SIZE)) {
        const url = `${project}/_apis/wit/workitems?ids=${c}&$expand=all`;
        const res = await this.get<WorkItemResponse1>(url);
        for (const item of res?.data?.value ?? []) {
          const id = item?.id;
          const url2 = `${project}/_apis/wit/workitems/${id}/updates`;
          const res2 = await this.get<WorkItemResponse2>(url2);
          const item2 = res2?.data?.value;
          // NB: We need to append the CustomWorkItem object to a property called custom
          // within fields object since in the new version destination doesn't support
          // custom work item fields.
          const returnObj = item as CustomWorkItem;
          returnObj.fields.custom = item2;
          yield returnObj;
        }
      }
    }
  }

  async getIdsFromAWorkItemType(
    workItemsType: string
  ): Promise<ReadonlyArray<string>> {
    const cutoffDate = DateTime.now().minus({days: this.cutoffDays});
    const cutoffDateFormatted = cutoffDate.toFormat('MM-dd-yyyy');
    const ids = [];

    for (const project of this.projects) {
      const data = {
        query:
          'Select [System.Id] From WorkItems WHERE' +
          " [System.TeamProject] = '" +
          project +
          "'" +
          " AND [System.CreatedDate] > '" +
          cutoffDateFormatted +
          "'" +
          ' AND [System.WorkItemType] = ' +
          workItemsType +
          ' order by [id] asc',
      };

      const list = await this.post<any>(`${project}/_apis/wit/wiql`, data);

      for (let i = 0; i < list.data.workItems.length; i++) {
        ids.push(list.data.workItems[i].id);
      }
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
    const iterationArray: any[] = [];
    for (const project of this.projects) {
      const res = await this.get<any>(
        `/${project}/_apis/work/teamsettings/iterations`
      );
      let response;
      let response2;
      this.logger.info(
        `Found ${res.data?.value?.length} boards for project ${project}`
      );
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
  }

  async *getBoards(): AsyncGenerator<Board> {
    const allBoards: Board[] = [];
    for (const project of this.projects) {
      const res = await this.get<any>(`/${project}/_apis/work/boards`);
      const boards = res.data?.value ?? [];
      this.logger.info(`Found ${boards.length} boards for project ${project}`);
      for (const item of boards) {
        yield item;
      }
    }
  }
}
