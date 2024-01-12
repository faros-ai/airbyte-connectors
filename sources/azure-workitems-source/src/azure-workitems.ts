import axios, {AxiosInstance, AxiosResponse} from 'axios';
import {AirbyteLogger, base64Encode} from 'faros-airbyte-cdk';
import {chunk, flatten} from 'lodash';
import {DateTime} from 'luxon';
import {VError} from 'verror';

import {
  Board,
  User,
  UserResponse,
  WorkItemResponse1,
  WorkItemResponse2,
} from './models';
const DEFAULT_API_VERSION = '7.0';
const DEFAULT_GRAPH_VERSION = '7.1-preview.1';
const MAX_BATCH_SIZE = 200;
export const DEFAULT_CUTOFF_DAYS = 90;
export const DEFAULT_REQUEST_TIMEOUT = 60000;

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
      const board = await this.getBoards().next();
      this.logger.info(`Found board ${board.value.name}`);
    } catch (err: any) {
      throw new VError(
        err,
        'Please verify your access token and other information are correct'
      );
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

  async *getWorkitems(): AsyncGenerator<any> {
    const promises = await this.getIdsFromAWorkItemType();
    const results = await Promise.all(promises);
    const ids: ReadonlyArray<string> = flatten(results);

    for (const c of chunk(ids, MAX_BATCH_SIZE)) {
      const url = `/_apis/wit/workitems?ids=${c}&$expand=all`;
      const res = await this.get<WorkItemResponse1>(url);
      for (const item of res?.data?.value ?? []) {
        const id = item?.id;
        const url2 = `/_apis/wit/workitems/${id}/updates`;
        const res2 = await this.get<WorkItemResponse2>(url2);
        const item2 = res2?.data?.value;
        yield {item, item2};
      }
    }
  }

  async getIdsFromAWorkItemType(): Promise<ReadonlyArray<string>> {
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
          ' order by [id] asc',
      };

      const list = await this.post<any>(`/_apis/wit/wiql`, data);

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
    for (const project of this.projects) {
      const res = await this.get<any>(
        `/${project}/_apis/work/teamsettings/iterations`
      );
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
  }

  async *getBoards(): AsyncGenerator<Board> {
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
