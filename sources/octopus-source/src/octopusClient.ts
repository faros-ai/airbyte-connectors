import axios, {AxiosError, AxiosInstance, AxiosResponse} from 'axios';
import axiosRetry, {
  IAxiosRetryConfig,
  isIdempotentRequestError,
} from 'axios-retry';
import {AirbyteLogger, wrapApiError} from 'faros-airbyte-cdk';
import isRetryAllowed from 'is-retry-allowed';
import _ from 'lodash';
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
  DeploymentVariable as OctopusDeploymentVariable,
  Project as OctopusProject,
  Release as OctopusRelease,
  ServerTask as OctopusServerTask,
  Space as OctopusSpace,
  VariableSetResponse,
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

    const cleanInstanceUrl = config.instanceUrl.replace(/\/$/, '');

    this.api = axios.create({
      baseURL: `${cleanInstanceUrl}/api`,
      headers: {
        'X-Octopus-ApiKey': config.apiKey,
      },
      timeout: 30_000,
      maxContentLength: Infinity,
    });

    // TODO: refactor to common library and apply to all sources that use axios
    const isNetworkError = (error): boolean => {
      return (
        !error.response &&
        Boolean(error.code) && // Prevents retrying cancelled requests
        isRetryAllowed(error) // Prevents retrying unsafe errors
      );
    };

    const isNonRetryable500 = (error: AxiosError): boolean => {
      return (
        error.response &&
        error.response.status >= 500 &&
        error.response.status <= 599 &&
        _.get(error, 'response.data.ErrorMessage', '').includes(
          'We received a request for a version-controlled resource'
        )
      );
    };

    if (retries > 0) {
      const retryConfig: IAxiosRetryConfig = {
        retryDelay: axiosRetry.exponentialDelay,
        shouldResetTimeout: true,
        retries,
        retryCondition: (error: AxiosError): boolean => {
          return (
            (isNetworkError(error) || isIdempotentRequestError(error)) &&
            !isNonRetryable500(error)
          );
        },
        onRetry: (retryCount, error, requestConfig) => {
          this.logger?.info(
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
  ): Promise<DeploymentProcess | undefined> {
    try {
      const process = await this.get<OctopusDeploymentProcess>(
        `/projects/${projectId}/deploymentprocesses`
      );
      return cleanProcess(process);
    } catch (err: any) {
      return undefined;
    }
  }

  async getDeploymentProcess(
    deploymentProcessId: string
  ): Promise<DeploymentProcess | undefined> {
    try {
      const process = await this.get<OctopusDeploymentProcess>(
        `/deploymentprocesses/${deploymentProcessId}`
      );
      return cleanProcess(process);
    } catch (err: any) {
      return undefined;
    }
  }

  async getVariableSet(
    spaceId: string,
    variableSetId: string
  ): Promise<OctopusDeploymentVariable[] | undefined> {
    try {
      const res: VariableSetResponse = await this.get<VariableSetResponse>(
        `/${spaceId}/variables/${variableSetId}`
      );
      return res.Variables;
    } catch (err: any) {
      this.logger?.warn(
        err,
        `Could not retrieve variable set: ${variableSetId}.`
      );
      return undefined;
    }
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
