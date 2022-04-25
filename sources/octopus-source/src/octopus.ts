import {
  Client,
  ClientConfiguration,
  Repository,
} from '@octopusdeploy/api-client';
import {ProjectResource} from '@octopusdeploy/message-contracts';
import axios, {AxiosInstance} from 'axios';
import {AirbyteLogger, wrapApiError} from 'faros-airbyte-cdk/lib';
import {VError} from 'verror';

import {Project, ProjectResponse} from './models';

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
      timeout: 10000, // default is `0` (no timeout)
      maxContentLength: 500000, //default is 2000 bytes
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
      const iter = this.getProjects();
      iter.next();
    } catch (err: any) {
      this.createError(err, 'Please verify your token is correct.');
    }
  }

  async *getProjects(): AsyncGenerator<Project> {
    const completeList = await this.httpClient.get<Project>('/projects/all');
    if (completeList.status === 200) {
      console.log(completeList.data);
      yield completeList.data;
    }
  }

  // async *getGroups(maxResults = 999): AsyncGenerator<Group> {
  //   for await (const group of this.paginate<Group>('groups', {
  //     params: {
  //       $top: maxResults,
  //     },
  //   })) {
  //     const memberItems = await this.httpClient.get<UserResponse>(
  //       `groups/${group.id}/members`
  //     );
  //     if (memberItems.status === 200) {
  //       const members: string[] = [];
  //       for (const memberItem of memberItems.data.value) {
  //         members.push(memberItem.id);
  //       }
  //       group.members = members;
  //     }
  //     const ownerItems = await this.httpClient.get<UserResponse>(
  //       `groups/${group.id}/owners`
  //     );
  //     if (ownerItems.status === 200) {
  //       const owners: string[] = [];
  //       for (const ownerItem of ownerItems.data.value) {
  //         owners.push(ownerItem.id);
  //       }
  //       group.owners = owners;
  //     }
  //     yield group;
  //   }
  // }
}
