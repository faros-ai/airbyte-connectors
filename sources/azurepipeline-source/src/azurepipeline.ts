import {AxiosInstance, AxiosRequestConfig, AxiosResponse} from 'axios';
import {AirbyteLogger, base64Encode, wrapApiError} from 'faros-airbyte-cdk';
import {
  Build,
  BuildArtifactResponse,
  BuildResponse,
  BuildTimelineResponse,
  Pipeline,
  PipelineResponse,
  Release,
  ReleaseResponse,
} from 'faros-airbyte-common/azurepipeline';
import {makeAxiosInstanceWithRetry, Utils} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';
import {VError} from 'verror';

const DEFAULT_API_URL = 'https://dev.azure.com';
const DEFAULT_VSRM_API_URL = 'https://vsrm.dev.azure.com';
const DEFAULT_API_VERSION = '6.0';

const DEFAULT_CUTOFF_DAYS = 90;
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_API_TIMEOUT_MS = 0; // 0 means no timeout
const DEFAULT_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 1000;
const CONTINUATION_TOKEN_HEADER = 'x-ms-continuationtoken';

export interface AzurePipelineConfig {
  readonly organization: string;
  readonly projects: string[];
  readonly access_token: string;
  readonly cutoff_days?: number;
  readonly page_size?: number;
  readonly api_url?: string;
  readonly vsrm_api_url?: string;
  readonly api_version?: string;
  readonly api_timeout?: number;
  readonly max_retries?: number;
  readonly api_retry_delay?: number;
}

// todo move to azure common utility
export interface ProjectResponse {
  count: number;
  value: Project[];
}

export interface Project {
  id: string;
  name: string;
  url: string;
  description: string;
  state: string;
  revision: number;
  visibility: string;
  lastUpdateTime: string;
}

export class AzurePipeline {
  private static azurePipeline: AzurePipeline = null;

  constructor(
    private readonly httpClient: AxiosInstance,
    private readonly httpVSRMClient: AxiosInstance,
    private readonly startDate: Date,
    private projects: string[],
    private readonly pageSize: number,
    private readonly maxRetries: number,
    private readonly logger: AirbyteLogger
  ) {}

  static async instance(
    config: AzurePipelineConfig,
    logger?: AirbyteLogger
  ): Promise<AzurePipeline> {
    if (AzurePipeline.azurePipeline) return AzurePipeline.azurePipeline;

    // TODO - Move to common utility for Azure clients
    if (!config.access_token) {
      throw new VError('Please provide an access token');
    }

    if (!config.organization) {
      throw new VError('Please provide an organization');
    }

    if (config.projects?.length > 1 && config.projects?.includes('*')) {
      throw new VError('Projects provided in addition to * keyword');
    }

    const cutoff_days = config.cutoff_days ?? DEFAULT_CUTOFF_DAYS;

    const accessToken = base64Encode(`:${config.access_token}`);

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - cutoff_days);

    const apiUrl = config.api_url ?? DEFAULT_API_URL;
    const apiVersion = config.api_version ?? DEFAULT_API_VERSION;

    const httpClient = makeAxiosInstanceWithRetry(
      {
        baseURL: `${apiUrl}/${config.organization}`,
        timeout: config.api_timeout ?? DEFAULT_API_TIMEOUT_MS,
        maxContentLength: Infinity, //default is 2000 bytes
        params: {
          'api-version': apiVersion,
        },
        headers: {
          Authorization: `Basic ${accessToken}`,
        },
      },
      logger?.asPino(),
      config.max_retries ?? DEFAULT_RETRIES,
      config.api_retry_delay ?? DEFAULT_RETRY_DELAY_MS
    );


    const vsrmApiUrl = config.vsrm_api_url ?? DEFAULT_VSRM_API_URL;
    const httpVSRMClient = makeAxiosInstanceWithRetry(
      {
        baseURL: `${vsrmApiUrl}/${config.organization}`,
        timeout: config.api_timeout ?? DEFAULT_API_TIMEOUT_MS,
        maxContentLength: Infinity, //default is 2000 bytes
        params: {
          'api-version': apiVersion,
        },
        headers: {
          Authorization: `Basic ${accessToken}`,
        },
      },
      logger?.asPino(),
      config.max_retries ?? DEFAULT_RETRIES,
      config.api_retry_delay ?? DEFAULT_RETRY_DELAY_MS
    );

    AzurePipeline.azurePipeline = new AzurePipeline(
      httpClient,
      httpVSRMClient,
      startDate,
      config.projects,
      config.page_size ?? DEFAULT_PAGE_SIZE,
      config.max_retries ?? DEFAULT_RETRIES,
      logger
    );

    await AzurePipeline.azurePipeline.initializeProjects();

    return AzurePipeline.azurePipeline;
  }

  private async initializeProjects(): Promise<void> {
    if (!this.projects?.length || this.projects[0] === '*') {
      this.projects = await this.listProjects();
    }

    if (!Array.isArray(this.projects) || !this.projects?.length) {
      throw new VError(
        'Projects were not provided and could not be initialized'
      );
    }

    this.logger.info(
      `Projects that will be synced: [${AzurePipeline.azurePipeline.projects.join(
        ','
      )}]`
    );
  }

  getInitializedProjects(): string[] {
    return this.projects;
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
        yield {
          projectName: project,
          ...pipeline,
        };
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
    lastFinishTime?: number,
    logger?: AirbyteLogger
  ): AsyncGenerator<Build> {
    const startTime = lastFinishTime
      ? Utils.toDate(lastFinishTime)
      : this.startDate;
    //https://docs.microsoft.com/en-us/rest/api/azure/devops/build/builds/list?view=azure-devops-rest-6.0
    //https://docs.microsoft.com/en-us/rest/api/azure/devops/build/builds/list?view=azure-devops-rest-6.0#buildqueryorder
    const params = {
      queryOrder: 'finishTimeAscending',
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
        if (
          item.reason === 'pullRequest' &&
          item.status === 'completed' &&
          item.result === 'succeeded'
        ) {
          logger?.debug(`Attempting to fetch coverage for build ${item.id}`);

          const coverageRes = await this.httpClient.get<any>(
            `${project}/_apis/test/codecoverage`,
            {
              params: {
                buildId: item.id,
              },
            }
          );

          const coverageStats = [];
          if (
            coverageRes.status === 200 &&
            coverageRes.data.coverageDetailedSummaryStatus ===
              'codeCoverageSuccess'
          ) {
            logger?.debug(`Coverage found for build ${item.id}`);
            for (const coverage of coverageRes.data.coverageData ?? []) {
              coverageStats.push(...coverage.coverageStats);
            }
          }
          item.coverageStats = coverageStats;
        }

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
    lastCreatedOn?: number,
    logger?: AirbyteLogger
  ): AsyncGenerator<Release> {
    const startTime = lastCreatedOn
      ? Utils.toDate(lastCreatedOn)
      : this.startDate;
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

  // todo move to azure common utility
  private async listProjects(): Promise<string[]> {
    const projects: string[] = [];
    for await (const projectRes of this.getPaginated<ProjectResponse>(
      '_apis/projects',
      '$top',
      '$skip',
      {},
      this.pageSize
    )) {
      for (const project of projectRes?.data?.value ?? []) {
        projects.push(project.name);
      }
    }
    return projects;
  }

  private async *getPaginated<T extends {value: any[]}>(
    path: string,
    topParamName: string,
    skipParamName: string,
    params: Dictionary<any>,
    top: number = this.pageSize
  ): AsyncGenerator<AxiosResponse<T> | undefined> {
    let resCount = 0;
    let skip = 0;
    let res: AxiosResponse<T> | undefined = undefined;
    params[topParamName] = top;

    do {
      params[skipParamName] = skip;
      res = await this.getHandleNotFound(path, {params});
      if (res) yield res;
      resCount = (res?.data?.value ?? []).length;
      skip += resCount;
    } while (resCount >= top);
  }

  private sleep(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  // Read more: https://learn.microsoft.com/en-us/azure/devops/integrate/concepts/rate-limits?view=azure-devops#api-client-experience
  private async maybeSleepOnResponse<T = any>(
    path: string,
    res?: AxiosResponse<T>
  ): Promise<boolean> {
    const retryAfterSecs = res?.headers?.['retry-after'];
    if (retryAfterSecs) {
      const retryRemaining = res?.headers?.['x-ratelimit-remaining'];
      const retryRatelimit = res?.headers?.['x-ratelimit-limit'];
      this.logger.warn(
        `'Retry-After' response header is detected when requesting ${path}. ` +
          `Waiting for ${retryAfterSecs} seconds before making any requests. ` +
          `(TSTUs remaining: ${retryRemaining}, TSTUs total limit: ${retryRatelimit})`
      );
      await this.sleep(Number.parseInt(retryAfterSecs) * 1000);
      return true;
    }
    return false;
  }

  private async getHandleNotFound<T = any, D = any>(
    path: string,
    conf?: AxiosRequestConfig<D>,
    attempt = 1
  ): Promise<AxiosResponse<T> | undefined> {
    try {
      const res = await this.httpClient.get<T, AxiosResponse<T>>(path, conf);
      await this.maybeSleepOnResponse(path, res);
      return res;
    } catch (err: any) {
      if (err?.response?.status === 429 && attempt <= this.maxRetries) {
        this.logger.warn(
          `Request to ${path} was rate limited. Retrying... ` +
            `(attempt ${attempt} of ${this.maxRetries})`
        );
        await this.maybeSleepOnResponse(path, err?.response);
        return await this.getHandleNotFound(path, conf, attempt + 1);
      }
      if (err?.response?.status === 404) {
        return undefined;
      }
      throw wrapApiError(err, `Failed to get ${path}. `);
    }
  }
}
