import {AirbyteLogger, wrapApiError} from 'faros-airbyte-cdk';
import fs from 'fs-extra';
import {GraphQLClient} from 'graphql-request';
import path from 'path';
import {VError} from 'verror';

const GRAPHQL_API_URL = 'https://api.linear.app/graphql';

const USERS_QUERY = fs.readFileSync(
  path.join(__dirname, '..', '..', 'resources', 'gql', 'users-query.gql'),
  'utf8'
);
const PROJECTS_QUERY = fs.readFileSync(
  path.join(__dirname, '..', '..', 'resources', 'gql', 'projects-query.gql'),
  'utf8'
);
const CYCLES_QUERY = fs.readFileSync(
  path.join(__dirname, '..', '..', 'resources', 'gql', 'cycles-query.gql'),
  'utf8'
);
export interface User {
  readonly id: string;
  readonly name: string;
  readonly displayName: string;
  readonly email: string;
  readonly createdAt: string;
}

export interface Project {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface Cycle {
  readonly id: string;
  readonly name: string;
  readonly number: number;
  readonly progress: number;
  readonly createdAt: string;
  readonly startsAt: string;
  readonly endsAt: string;
}

export interface LinearConfig {
  readonly api_key: string;
}

export class Linear {
  private static linear: Linear = null;

  constructor(private readonly graphClient: GraphQLClient) {}

  static instance(config: LinearConfig, logger: AirbyteLogger): Linear {
    if (Linear.linear) return Linear.linear;

    if (!config.api_key) {
      throw new VError('API key has to be provided');
    }

    const auth = `Bearer ${config.api_key}`;

    const graphClient = new GraphQLClient(`${GRAPHQL_API_URL}`, {
      headers: {Authorization: auth},
    });
    Linear.linear = new Linear(graphClient);
    logger.debug('Created Linear instance');
    return Linear.linear;
  }

  async checkConnection(): Promise<void> {
    try {
      await await this.graphClient.request(USERS_QUERY, {});
    } catch (err: any) {
      let errorMessage = 'Please verify your API key is correct. Error: ';
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

  async *getUsers(): AsyncGenerator<User> {
    const data = await this.graphClient.request(USERS_QUERY, {});
    for (const node of data.data.users.nodes ?? []) {
      yield node;
    }
  }

  async *getProjects(): AsyncGenerator<Project> {
    const data = await this.graphClient.request(PROJECTS_QUERY, {});
    for (const node of data.data.projects.nodes ?? []) {
      yield node;
    }
  }

  async *getCycles(): AsyncGenerator<Cycle> {
    const data = await this.graphClient.request(CYCLES_QUERY, {});
    for (const node of data.data.cycles.nodes ?? []) {
      yield node;
    }
  }
}
