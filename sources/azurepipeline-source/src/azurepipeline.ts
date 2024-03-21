import axios, {AxiosInstance} from 'axios';
import {AirbyteLogger, base64Encode, wrapApiError} from 'faros-airbyte-cdk';
import * as rax from 'retry-axios';
import {VError} from 'verror';

import {
  Build,
  BuildArtifactResponse,
  BuildResponse,
  BuildTimelineResponse,
  Pipeline,
  PipelineResponse,
  Release,
  ReleaseResponse,
} from './models';

const DEFAULT_API_VERSION = '6.0';
const DEFAULT_CUTOFF_DAYS = 90;
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_API_TIMEOUT_MS = 0; // 0 means no timeout
const DEFAULT_API_RETRIES = 3;
const DEFAULT_API_RETRY_DELAY_MS = 1000;
const CONTINUATION_TOKEN_HEADER = 'x-ms-continuationtoken';

export interface AzurePipelineConfig {
  readonly organization: string;
  readonly projects: string[];
  readonly access_token: string;
  readonly cutoff_days?: number;
  readonly page_size?: number;
  readonly api_version?: string;
  readonly api_timeout?: number;
  readonly api_retries?: number;
  readonly api_retry_delay?: number;
}

export class AzurePipeline {
  private static azurePipeline: AzurePipeline = null;

  constructor(
    private readonly httpClient: AxiosInstance,
    private readonly httpVSRMClient: AxiosInstance,
    private readonly startDate: Date,
    private readonly projects: ReadonlyArray<string>,
    private readonly pageSize: number
  ) {}

  static instance(config: AzurePipelineConfig): AzurePipeline {
    if (AzurePipeline.azurePipeline) return AzurePipeline.azurePipeline;

    if (!config.access_token) {
      throw new VError('Please provide an access token');
    }

    if (!config.organization) {
      throw new VError('Please provide an organization');
    }

    if (!config.projects || config.projects.length === 0) {
      throw new VError('Please provide at least one project name');
    }

    const cutoff_days = config.cutoff_days ?? DEFAULT_CUTOFF_DAYS;

    const accessToken = base64Encode(`:${config.access_token}`);

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - cutoff_days);

    const version = config.api_version ?? DEFAULT_API_VERSION;

    const raxConfig: rax.RetryConfig = {
      retry: config.api_retries ?? DEFAULT_API_RETRIES,
      noResponseRetries: config.api_retries ?? DEFAULT_API_RETRIES,
      retryDelay: config.api_retry_delay ?? DEFAULT_API_RETRY_DELAY_MS,
    };

    const httpClient = axios.create({
      baseURL: `https://dev.azure.com/${config.organization}`,
      timeout: config.api_timeout ?? DEFAULT_API_TIMEOUT_MS,
      maxContentLength: Infinity, //default is 2000 bytes
      params: {
        'api-version': version,
      },
      headers: {
        Authorization: `Basic ${accessToken}`,
      },
    });

    httpClient.defaults.raxConfig = raxConfig;
    rax.attach(httpClient);

    const httpVSRMClient = axios.create({
      baseURL: `https://vsrm.dev.azure.com/${config.organization}`,
      timeout: config.api_timeout ?? DEFAULT_API_TIMEOUT_MS,
      maxContentLength: Infinity, //default is 2000 bytes
      params: {
        'api-version': version,
      },
      headers: {
        Authorization: `Basic ${accessToken}`,
      },
    });

    httpVSRMClient.defaults.raxConfig = raxConfig;
    rax.attach(httpVSRMClient);

    AzurePipeline.azurePipeline = new AzurePipeline(
      httpClient,
      httpVSRMClient,
      startDate,
      config.projects,
      config.page_size ?? DEFAULT_PAGE_SIZE
    );

    return AzurePipeline.azurePipeline;
  }

  async checkConnection(): Promise<void> {
    try {
      const iter = this.getPipelines(this.projects[0]);
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

  async *getPipelines(
    project: string,
    logger?: AirbyteLogger
  ): AsyncGenerator<Pipeline> {
    const params = {$top: this.pageSize};
    let hasNext = true;
    let continuationToken = undefined;

    while (hasNext) {
      const res = await this.httpClient.get<PipelineResponse>(
        `${project}/_apis/pipelines`,
        {params}
      );

      logger?.info(`Fetched ${res.data.count} pipelines`);

      for (const pipeline of res.data.value) {
        yield pipeline;
      }

      continuationToken = res.headers[CONTINUATION_TOKEN_HEADER];
      hasNext = continuationToken !== undefined && continuationToken !== '';
      logger?.info(
        hasNext ? 'Fetching next pipelines page' : 'No more pipelines'
      );
      params['continuationToken'] = continuationToken;
    }
  }

  async *getBuilds(
    project: string,
    lastQueueTime?: string,
    logger?: AirbyteLogger
  ): AsyncGenerator<Build> {
    const startTime = lastQueueTime ? new Date(lastQueueTime) : this.startDate;
    //https://docs.microsoft.com/en-us/rest/api/azure/devops/build/builds/list?view=azure-devops-rest-6.0
    //https://docs.microsoft.com/en-us/rest/api/azure/devops/build/builds/list?view=azure-devops-rest-6.0#buildqueryorder
    const params = {
      queryOrder: 'queueTimeAscending',
      minTime: startTime.toISOString(),
      $top: this.pageSize,
    };
    let hasNext = true;
    let continuationToken = undefined;

    while (hasNext) {
      const res = await this.httpClient.get<BuildResponse>(
        `${project}/_apis/build/builds`,
        {params}
      );

      logger?.info(`Fetched ${res.data.count} builds`);

      for (const item of res.data.value) {
        const artifact = await this.httpClient.get<BuildArtifactResponse>(
          `${project}/_apis/build/builds/${item.id}/artifacts`
        );

        if (artifact.status === 200) {
          item.artifacts = artifact.data.value;
        }

        const timeline = await this.httpClient.get<BuildTimelineResponse>(
          `${project}/_apis/build/builds/${item.id}/timeline`
        );

        const timelines = [];
        if (timeline.status === 200) {
          for (const item of timeline.data.records) {
            if (item.type === 'Job') timelines.push(item);
          }
        }

        item.jobs = timelines;
        yield item;
      }

      continuationToken = res.headers[CONTINUATION_TOKEN_HEADER];
      hasNext = continuationToken !== undefined && continuationToken !== '';
      logger?.info(hasNext ? 'Fetching next builds page' : 'No more builds');
      params['continuationToken'] = continuationToken;
    }
  }

  async *getReleases(
    project: string,
    lastCreatedOn?: string,
    logger?: AirbyteLogger
  ): AsyncGenerator<Release> {
    const startTime = lastCreatedOn ? new Date(lastCreatedOn) : this.startDate;
    //https://docs.microsoft.com/en-us/rest/api/azure/devops/release/releases/list?view=azure-devops-rest-6.0
    //https://docs.microsoft.com/en-us/rest/api/azure/devops/release/releases/list?view=azure-devops-rest-6.0#releasequeryorder
    const params = {
      queryOrder: 'ascending',
      minCreatedTime: startTime.toISOString(),
      $top: this.pageSize,
    };
    let hasNext = true;
    let continuationToken = undefined;

    while (hasNext) {
      const res = await this.httpVSRMClient.get<ReleaseResponse>(
        `${project}/_apis/release/releases`,
        {params}
      );

      logger?.info(`Fetched ${res.data.count} releases`);

      for (const release of res.data.value) {
        yield release;
      }

      continuationToken = res.headers[CONTINUATION_TOKEN_HEADER];
      hasNext = continuationToken !== undefined && continuationToken !== '';
      logger?.info(
        hasNext ? 'Fetching next releases page' : 'No more releases'
      );
      params['continuationToken'] = continuationToken;
    }
  }
}
