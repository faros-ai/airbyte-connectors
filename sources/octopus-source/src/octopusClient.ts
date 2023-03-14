import axios, {AxiosInstance, AxiosResponse} from 'axios';
import axiosRetry, {IAxiosRetryConfig} from 'axios-retry';
import {AirbyteLogger, wrapApiError} from 'faros-airbyte-cdk';
import {Memoize} from 'typescript-memoize';
import {VError} from 'verror';

import {
  cleanProcess,
  DeploymentProcess,
  PagedResponse,
  PagingParams,
} from './models';
import {
  Deployment as OctopusDeployment,
  DeploymentEnvironment as OctopusDeploymentEnvironment,
  DeploymentProcess as OctopusDeploymentProcess,
  Project as OctopusProject,
  Release as OctopusRelease,
  ServerTask as OctopusServerTask,
  Space as OctopusSpace,
} from './octopusModels';

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_RETRIES = 3;

export interface OctopusClientConfig {
  readonly apiKey: string;
  readonly instanceUrl: string;
  readonly pageSize?: number;
  readonly maxRetries?: number;
  readonly logger?: AirbyteLogger;
}

/**
 * Client for interacting with Octopus APIs
 */
export class OctopusClient {
  private readonly pageSize: number;
  private readonly api: AxiosInstance;
  private readonly logger?: AirbyteLogger;

  constructor(readonly config?: OctopusClientConfig) {
    this.pageSize = config?.pageSize ?? DEFAULT_PAGE_SIZE;
    this.logger = config.logger;
    const retries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    const logger = this.logger; // for axios-retry

    this.api = axios.create({
      baseURL: `${config.instanceUrl}/api`,
      headers: {
        'X-Octopus-ApiKey': config.apiKey,
      },
      timeout: 30_000,
      maxContentLength: Infinity,
    });

    if (retries > 0) {
      const retryConfig: IAxiosRetryConfig = {
        retryDelay: axiosRetry.exponentialDelay,
        shouldResetTimeout: true,
        retries,
        onRetry(retryCount, error, requestConfig) {
          logger?.info(
            `Retrying request ${requestConfig.url} due to an error: ${error.message} ` +
              `(attempt ${retryCount} of ${retries})`
          );
        },
      };
      axiosRetry(this.api, retryConfig);
    }
  }

  async *listSpaces(): AsyncGenerator<OctopusSpace> {
    yield* this.paginate('/spaces');
  }

  async *listDeployments(spaceId: string): AsyncGenerator<OctopusDeployment> {
    yield* this.paginate(`/${spaceId}/deployments`);
  }

  async *listReleases(spaceId: string): AsyncGenerator<OctopusRelease> {
    yield* this.paginate(`/${spaceId}/releases`);
  }

  @Memoize((id) => id)
  async getProject(id: string): Promise<OctopusProject> {
    return this.get(`/projects/${id}`);
  }

  @Memoize((projectId) => projectId)
  async getProjectDeploymentProcess(
    projectId: string
  ): Promise<DeploymentProcess> {
    const process = await this.get<OctopusDeploymentProcess>(
      `projects/${projectId}/deploymentprocesses`
    );
    return cleanProcess(process);
  }

  @Memoize((id) => id)
  async getEnvironment(id: string): Promise<OctopusDeploymentEnvironment> {
    return this.get(`/environments/${id}`);
  }

  async getTask(id: string): Promise<OctopusServerTask> {
    return this.get(`/tasks/${id}`);
  }

  private async *paginate<T>(
    path: string,
    pageSize = this.pageSize
  ): AsyncGenerator<T> {
    const fn = (params: PagingParams): Promise<PagedResponse<T>> =>
      this.api.get(path, {params});

    let currentPage = 0;
    let skip = 0;
    let hasNext = true;
    while (hasNext) {
      const data = await this.wrapRequest(fn({skip, take: pageSize}));
      for (const item of data.Items) {
        yield item;
      }
      skip += pageSize;
      hasNext = currentPage < data.LastPageNumber;
      currentPage++;
    }
  }

  private get<T>(path: string): Promise<T> {
    return this.wrapRequest(this.api.get(path));
  }

  private async wrapRequest<T>(request: Promise<AxiosResponse<T>>): Promise<T> {
    try {
      const {data} = await request;
      return data;
    } catch (err: any) {
      const errorMessage = wrapApiError(err).message;
      throw new VError(errorMessage);
    }
  }
}
