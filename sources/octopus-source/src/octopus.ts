import {
  Client,
  ClientConfiguration,
  Repository,
} from '@octopusdeploy/api-client';
import {ProjectResource} from '@octopusdeploy/message-contracts';
import axios, {AxiosInstance} from 'axios';
import {AirbyteLogger, wrapApiError} from 'faros-airbyte-cdk/lib';
import {VError} from 'verror';

import {
  Channels,
  Deployments,
  Project,
  ProjectResponse,
  Releases,
} from './models';

export interface OctopusConfig {
  readonly apiKey: string;
  readonly apiUri: string;
  readonly autoConnect: boolean;
  readonly space?: string;
  readonly projectName: string;
}

export class Octopus {
  private static octopus: Octopus = null;

  constructor(
    private readonly httpClient: AxiosInstance,
    private readonly logger: AirbyteLogger
  ) {}

  static async instance(
    config: OctopusConfig,
    logger: AirbyteLogger
  ): Promise<Octopus> {
    if (Octopus.octopus) return Octopus.octopus;

    if (!config.apiKey) {
      throw new VError('api key must be a not empty string');
    }

    if (!config.apiUri) {
      throw new VError('server apiUrl must be a not empty string');
    }

    const httpClient = axios.create({
      baseURL: config.apiUri.concat('/api'),
      timeout: 0, // default is `0` (no timeout)
      maxContentLength: 9999999999, //default is 2000 bytes
      headers: {
        'X-Octopus-ApiKey': config.apiKey,
      },
    });

    Octopus.octopus = new Octopus(httpClient, logger);
    return Octopus.octopus;
  }

  private createError(error: any, errorMessage: string) {
    const err = error?.message ?? JSON.stringify(error);
    throw new VError(`${errorMessage} Error: ${err}`);
  }

  async checkConnection(): Promise<void> {
    try {
      const iter = this.getDeployments();
      iter.next();
    } catch (err: any) {
      this.createError(err, 'Please verify your token is correct.');
    }
  }

  async *getProjects(): AsyncGenerator<Project> {
    const completeList = await this.httpClient.get<Project>('/projects');
    if (completeList.status === 200) {
      console.log(completeList.data);
      yield completeList.data;
    }
  }

  async *getChannels(): AsyncGenerator<Channels> {
    const completeList = await this.httpClient.get<Channels>('/channels');
    if (completeList.status === 200) {
      console.log(completeList.data);
      yield completeList.data;
    }
  }

  async *getDeployments(): AsyncGenerator<Deployments> {
    const completeList = await this.httpClient.get<Deployments>('/channels');
    if (completeList.status === 200) {
      console.log(completeList.data);
      yield completeList.data;
    }
  }

  async *getReleases(): AsyncGenerator<Releases> {
    const completeList = await this.httpClient.get<Releases>('/releases');
    if (completeList.status === 200) {
      console.log(completeList.data);
      yield completeList.data;
    }
  }
}
