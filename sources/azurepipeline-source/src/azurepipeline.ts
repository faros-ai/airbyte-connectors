import axios, {AxiosInstance} from 'axios';
import {wrapApiError} from 'faros-airbyte-cdk';
import {Memoize} from 'typescript-memoize';
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
  RunResponse,
} from './models';

const DEFAULT_API_VERSION = '6.0';
const DEFAULT_MEMOIZE_START_TIME = 0;

export interface AzurePipelineConfig {
  readonly access_token: string;
  readonly organization: string;
  readonly cutoff_days: number;
  readonly api_version?: string;
  readonly project_names: string[];
}

export class AzurePipeline {
  private static azurePipeline: AzurePipeline = null;

  constructor(
    private readonly httpClient: AxiosInstance,
    private readonly httpVSRMClient: AxiosInstance,
    private readonly startDate: Date,
    private readonly projectNames: ReadonlyArray<string>
  ) {}

  static instance(config: AzurePipelineConfig): AzurePipeline {
    if (AzurePipeline.azurePipeline) return AzurePipeline.azurePipeline;

    if (!config.access_token) {
      throw new VError('access_token must not be an empty string');
    }

    if (!config.organization) {
      throw new VError('organization must not be an empty string');
    }

    if (!config.project_names || config.project_names.length === 0) {
      throw new VError('project name must not be an empty string list');
    }

    if (!config.cutoff_days) {
      throw new VError('cutoff_days is null or empty');
    }
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - config.cutoff_days);

    const version = config.api_version ?? DEFAULT_API_VERSION;
    const httpClient = axios.create({
      baseURL: `https://dev.azure.com/${config.organization}`,
      timeout: 10000, // default is `0` (no timeout)
      maxContentLength: Infinity, //default is 2000 bytes
      params: {
        'api-version': version,
      },
      headers: {
        Authorization: `Basic ${config.access_token}`,
      },
    });
    const httpVSRMClient = axios.create({
      baseURL: `https://vsrm.dev.azure.com/${config.organization}`,
      timeout: 10000, // default is `0` (no timeout)
      maxContentLength: Infinity, //default is 2000 bytes
      params: {
        'api-version': version,
      },
      headers: {
        Authorization: `Basic ${config.access_token}`,
      },
    });

    AzurePipeline.azurePipeline = new AzurePipeline(
      httpClient,
      httpVSRMClient,
      startDate,
      config.project_names
    );
    return AzurePipeline.azurePipeline;
  }

  async checkConnection(): Promise<void> {
    try {
      const iter = this.getPipelines(this.projectNames[0]);
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

  async *getPipelines(projectName: string): AsyncGenerator<Pipeline> {
    //https://docs.microsoft.com/en-us/rest/api/azure/devops/pipelines/pipelines/list?view=azure-devops-rest-6.0
    const res = await this.httpClient.get<PipelineResponse>(
      `${projectName}/_apis/pipelines`
    );
    for (const item of res.data.value) {
      const run = await this.httpClient.get<RunResponse>(
        `${projectName}/_apis/pipelines/${item.id}/runs`
      );
      if (run.status === 200) {
        item.runs = run.data.value;
      }
      yield item;
    }
  }
  @Memoize(
    (lastQueueTime?: string) =>
      new Date(lastQueueTime ?? DEFAULT_MEMOIZE_START_TIME)
  )
  async *getBuilds(
    projectName: string,
    lastQueueTime?: string
  ): AsyncGenerator<Build> {
    const startTime = new Date(lastQueueTime ?? 0);
    const startTimeMax =
      startTime > this.startDate ? startTime : this.startDate;
    //https://docs.microsoft.com/en-us/rest/api/azure/devops/build/builds/list?view=azure-devops-rest-6.0
    //https://docs.microsoft.com/en-us/rest/api/azure/devops/build/builds/list?view=azure-devops-rest-6.0#buildqueryorder
    const res = await this.httpClient.get<BuildResponse>(
      `${projectName}/_apis/build/builds?queryOrder=queueTimeAscending&minTime=${startTimeMax.toISOString()}`
    );
    for (const item of res.data.value) {
      const artifact = await this.httpClient.get<BuildArtifactResponse>(
        `${projectName}/_apis/build/builds/${item.id}/artifacts`
      );
      if (artifact.status === 200) {
        item.artifacts = artifact.data.value;
      }
      const timeline = await this.httpClient.get<BuildTimelineResponse>(
        `${projectName}/_apis/build/builds/${item.id}/timeline`
      );
      const timelines = [];
      if (timeline.status === 200) {
        for (const item of timeline.data.records) {
          timelines.push(item);
        }
      }
      item.jobs = timelines;
      yield item;
    }
  }
  @Memoize(
    (lastCreatedOn?: string) =>
      new Date(lastCreatedOn ?? DEFAULT_MEMOIZE_START_TIME)
  )
  async *getReleases(
    projectName: string,
    lastCreatedOn?: string
  ): AsyncGenerator<Release> {
    const startTime = new Date(lastCreatedOn ?? 0);
    const startTimeMax =
      startTime > this.startDate ? startTime : this.startDate;
    //https://docs.microsoft.com/en-us/rest/api/azure/devops/release/releases/list?view=azure-devops-rest-6.0
    //https://docs.microsoft.com/en-us/rest/api/azure/devops/release/releases/list?view=azure-devops-rest-6.0#releasequeryorder
    const res = await this.httpVSRMClient.get<ReleaseResponse>(
      `${projectName}/_apis/release/releases?queryOrder=ascending&minCreatedTime=${startTimeMax.toISOString()}`
    );
    for (const item of res.data.value) {
      yield item;
    }
  }
}
