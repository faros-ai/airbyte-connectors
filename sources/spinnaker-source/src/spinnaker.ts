import axios, {AxiosInstance} from 'axios';
import {AirbyteConfig, AirbyteLogger} from 'faros-airbyte-cdk';
import {wrapApiError} from 'faros-feeds-sdk';
import {Dictionary} from 'ts-essentials';
import {VError} from 'verror';

const DEFAULT_API_VERSION = 'v2/';
const DEFAULT_LIMIT = 500;

export interface SpinnakerConfig extends AirbyteConfig {
  readonly server_url: string;
  readonly api_version?: string;
  readonly applications?: string[];
  readonly buildMasters?: string[];
  readonly pipelineConfigIds?: string[];
  readonly limit?: number;
}

export type Application = Dictionary<any, string>;
export type Build = Dictionary<any, string>;
export type Execution = Dictionary<any, string>;
export type Pipeline = Dictionary<any, string>;
export type Job = Dictionary<any, string>;

export class Spinnaker {
  private static spinnaker: Spinnaker = null;

  constructor(
    private readonly httpClient: AxiosInstance,
    private readonly apiVersion: string,
    private readonly limit: number
  ) {}

  static instance(config: SpinnakerConfig, logger: AirbyteLogger): Spinnaker {
    if (Spinnaker.spinnaker) return Spinnaker.spinnaker;

    if (!config.server_url) {
      throw new VError('server_url must be a not empty string');
    }

    const httpClient = axios.create({
      baseURL: config.server_url,
      timeout: 5000, // default is `0` (no timeout)
      maxContentLength: 20000, //default is 2000 bytes
      headers: {
        // Authorization: `OAuth ${config.api_key}`,
      },
    });
    const version = config.api_version || DEFAULT_API_VERSION;
    const limit = config.limit || DEFAULT_LIMIT;

    Spinnaker.spinnaker = new Spinnaker(httpClient, version, limit);
    logger.debug('Created Spinnaker instance');

    return Spinnaker.spinnaker;
  }

  async checkConnection(): Promise<void> {
    try {
      await this.httpClient.get('applications');
    } catch (err: any) {
      let errorMessage = 'Please verify your token are correct. Error: ';
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

  async *getApplications(): AsyncGenerator<Application> {
    const res = await this.httpClient.get<Application[]>('applications');

    for await (const item of res.data) {
      yield item;
    }
  }

  async *getBuilds(buildMaster: string): AsyncGenerator<Build> {
    const res = await this.httpClient.get<Build[]>(
      `${this.apiVersion}/builds/${buildMaster}/builds/**`
    );

    for await (const item of res.data) {
      yield item;
    }
  }

  async *getExecutions(pipelineConfigIds: string): AsyncGenerator<Execution> {
    const res = await this.httpClient.get<Execution[]>(`/executions`, {
      params: {pipelineConfigIds, limit: this.limit},
    });

    for await (const item of res.data) {
      yield item;
    }
  }

  async *getPipelines(app: string): AsyncGenerator<Pipeline> {
    const res = await this.httpClient.get<Pipeline[]>(
      `applications/${app}/pipelines`,
      {params: {limit: this.limit}}
    );
    for await (const item of res.data) {
      yield item;
    }
  }

  async *getJobs(buildMaster: string): AsyncGenerator<Job> {
    const res = await this.httpClient.get<Job[]>(
      `${this.apiVersion}/builds/${buildMaster}/jobs`
    );

    for await (const item of res.data) {
      yield item;
    }
  }
}
