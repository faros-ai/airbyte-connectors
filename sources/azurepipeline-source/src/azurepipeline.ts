import axios, {AxiosInstance} from 'axios';
import {AirbyteLogger} from 'faros-airbyte-cdk/lib';
import {wrapApiError} from 'faros-feeds-sdk';
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

export interface AzurePipelineConfig {
  readonly access_token: string;
  readonly organization: string;
  readonly project: string;
  readonly api_version?: string;
}

export class AzurePipeline {
  private static azurePipeline: AzurePipeline = null;

  constructor(
    private readonly httpClient: AxiosInstance,
    private readonly httpVSRMClient: AxiosInstance,
    private readonly logger: AirbyteLogger
  ) {}

  static async instance(
    config: AzurePipelineConfig,
    logger: AirbyteLogger
  ): Promise<AzurePipeline> {
    if (AzurePipeline.azurePipeline) return AzurePipeline.azurePipeline;

    if (!config.access_token) {
      throw new VError('access_token must be a not empty string');
    }

    if (!config.organization) {
      throw new VError('organization must be a not empty string');
    }

    if (!config.project) {
      throw new VError('project must be a not empty string');
    }

    const version = config.api_version ?? DEFAULT_API_VERSION;
    const httpClient = axios.create({
      baseURL: `https://dev.azure.com/${config.organization}/${config.project}/_apis`,
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
      baseURL: `https://vsrm.dev.azure.com/${config.organization}/${config.project}/_apis`,
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
      logger
    );
    return AzurePipeline.azurePipeline;
  }

  async checkConnection(): Promise<void> {
    try {
      const iter = this.getPipelines();
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

  async *getPipelines(): AsyncGenerator<Pipeline> {
    const res = await this.httpClient.get<PipelineResponse>('pipelines');
    for (const item of res.data.value) {
      yield item;
    }
  }

  async *getBuilds(): AsyncGenerator<Build> {
    const res = await this.httpClient.get<BuildResponse>('build/builds');
    for (const item of res.data.value) {
      const artifact = await this.httpClient.get<BuildArtifactResponse>(
        `build/builds/${item.id}/artifacts`
      );
      item.artifacts = artifact.data.value;

      const timeline = await this.httpClient.get<BuildTimelineResponse>(
        `build/builds/${item.id}/timeline`
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
  }

  async *getReleases(): AsyncGenerator<Release> {
    const res = await this.httpVSRMClient.get<ReleaseResponse>(
      'release/releases'
    );
    for (const item of res.data.value) {
      yield item;
    }
  }
}
