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
      const iter = this.getReleases();
      await iter.next();
    } catch (err: any) {
      this.createError(err, 'Please verify your token is correct.');
    }
  }

  private async *paginate<T>(path: string, param = {}): AsyncGenerator<T> {
    try {
      const res = await this.httpClient.get<T[]>(path, param);
      const totalPages = res.data['NumberOfPages'];
      const data = [];

      for (let totalcalls = 1; totalcalls <= totalPages; totalcalls++) {
        console.log(param);
        const res = await this.httpClient.get<T[]>(path, param);
        for (const item of res.data['Items']) {
          data.push(item);
        }
        param['params']['skip'] = param['params']['take'] * totalcalls;
      }

      for (const item of data) {
        yield item;
      }
    } catch (err: any) {
      const errorMessage = wrapApiError(err).message;
      this.logger.error(
        `Failed requesting '${path}' with params ${JSON.stringify(
          param
        )}. Error: ${errorMessage}`
      );
      throw new VError(errorMessage);
    }
  }

  async *getProjects(maxResults = 5): AsyncGenerator<Project> {
    for await (const projects of this.paginate<Project>('/projects', {
      params: {
        take: maxResults,
      },
    })) {
      console.log(projects);
      yield projects;
    }
  }

  async *getChannels(maxResults = 5): AsyncGenerator<Channels> {
    for await (const channels of this.paginate<Channels>('/channels', {
      params: {
        take: maxResults,
      },
    })) {
      console.log(channels);
      yield channels;
    }
  }

  async *getDeployments(maxResults = 5): AsyncGenerator<Deployments> {
    for await (const deployments of this.paginate<Deployments>('/deployments', {
      params: {
        take: maxResults,
      },
    })) {
      console.log(deployments);
      yield deployments;
    }
  }

  async *getReleases(maxResults = 5): AsyncGenerator<Releases> {
    for await (const release of this.paginate<Releases>('/releases', {
      params: {
        take: maxResults,
      },
    })) {
      console.log(release);
      yield release;
    }
  }
}
