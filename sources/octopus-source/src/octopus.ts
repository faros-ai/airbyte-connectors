import {
  Client,
  ClientConfiguration,
  Repository,
} from '@octopusdeploy/api-client';
import {ProjectResource} from '@octopusdeploy/message-contracts';
import {AirbyteLogger, wrapApiError} from 'faros-airbyte-cdk/lib';
import {VError} from 'verror';

import {
  Group,
  GroupResponse,
  User,
  UserExtraInfo,
  UserResponse,
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
    private readonly client: Client,
    private readonly repository: Repository,
    private readonly logger: AirbyteLogger
  ) {}

  static async instance(
    config: OctopusConfig,
    logger: AirbyteLogger
  ): Promise<Octopus> {
    if (Octopus.octopus) return Octopus.octopus;

    if (!config.apiKey) {
      throw new VError('client_id must be a not empty string');
    }

    if (!config.apiUri) {
      throw new VError('client_secret must be a not empty string');
    }

    if (!config.projectName) {
      throw new VError('projectName must be a not empty string');
    }

    const configuration: ClientConfiguration = {
      apiKey: config.apiKey, // required
      apiUri: config.apiUri, // required
      autoConnect: true,
    };
    let client: Client | undefined;
    let repository: Repository | undefined;
    try {
      client = await Client.create(configuration);
    } catch (error) {
      console.error('The Octopus API client could not be constructed.');
      return;
    }
    try {
      repository = new Repository(client);
    } catch (error) {
      console.error('The Octopus API repository could not be constructed.');
      return;
    }

    return new Octopus(client, repository, logger);
  }

  private createError(error: any, errorMessage: string) {
    const err = error?.message ?? JSON.stringify(error);
    throw new VError(`${errorMessage} Error: ${err}`);
  }

  async checkConnection(): Promise<void> {
    try {
      const iter = await this.repository.projects.list();
      // await iter.next();
    } catch (err: any) {
      this.createError(err, 'Please verify your token is correct.');
    }
  }

  async *getProjects(): AsyncGenerator<User> {
    const iter = await this.repository.projects.list();
    console.log(iter);
   // yield iter;
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
