import {AirbyteLogger, wrapApiError} from 'faros-airbyte-cdk';
import fs from 'fs-extra';
import {GraphQLClient} from 'graphql-request';
import path from 'path';
import {VError} from 'verror';

const GRAPHQL_API_URL = 'https://api.linear.app/graphql';
const DEFAULT_PAGE_SIZE = 10;

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
const TEAMS_QUERY = fs.readFileSync(
  path.join(__dirname, '..', '..', 'resources', 'gql', 'teams-query.gql'),
  'utf8'
);
const LABELS_QUERY = fs.readFileSync(
  path.join(__dirname, '..', '..', 'resources', 'gql', 'labels-query.gql'),
  'utf8'
);
const ISSUES_QUERY = fs.readFileSync(
  path.join(__dirname, '..', '..', 'resources', 'gql', 'issues-query.gql'),
  'utf8'
);
export interface CommonKey {
  readonly id: string;
  readonly name: string;
}

export interface Assignee extends CommonKey {
  readonly createdAt: string;
}

export interface Label extends CommonKey {
  readonly description: string;
  readonly createdAt: string;
}

export interface User extends CommonKey {
  readonly displayName: string;
  readonly email: string;
  readonly createdAt: string;
}

export interface Project extends CommonKey {
  readonly description: string;
  readonly createdAt: string;
  readonly completedAt: string;
  readonly updatedAt: string;
  readonly progress: number;
}

export interface Cycle extends CommonKey {
  readonly number: number;
  readonly progress: number;
  readonly createdAt: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly completedAt: string;
}

export interface Team extends CommonKey {
  readonly description: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly members: [
    {
      id: string;
    }
  ];
}

export interface IssueHistory {
  readonly actor?: {
    id: string;
  };
  readonly createdAt: string;
  readonly fromState: CommonKey;
  readonly toState: CommonKey;
}

export interface Issue {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly priority: number;
  readonly url: string;
  readonly state: CommonKey;
  readonly history: [IssueHistory];
  readonly parent: {
    id: string;
  };
  readonly assignee: Assignee;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly labels: [CommonKey];
  readonly project: CommonKey;
  readonly cycle: {
    id: string;
  };
  readonly creator: {
    id: string;
  };
  cursor?: string;
}

export interface LinearConfig {
  readonly api_key: string;
  readonly cutoff_days: number;
  readonly page_size?: number;
}

interface PaginateResponse<T> {
  data: T[];
  pageInfo: PageInfo;
}

export interface PageInfo {
  hasNextPage: boolean;
  endCursor: string;
}

export class Linear {
  private static linear: Linear = null;

  constructor(
    private readonly graphClient: GraphQLClient,
    readonly startDate: Date,
    private readonly pageSize?: number
  ) {}

  static instance(config: LinearConfig, logger: AirbyteLogger): Linear {
    if (Linear.linear) return Linear.linear;

    if (!config.api_key) {
      throw new VError('API key has to be provided');
    }

    if (!config.cutoff_days) {
      throw new VError('cutoff_days is null or empty');
    }

    const auth = `Bearer ${config.api_key}`;

    const graphClient = new GraphQLClient(`${GRAPHQL_API_URL}`, {
      headers: {Authorization: auth},
    });

    const pageSize = config.page_size ?? DEFAULT_PAGE_SIZE;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - config.cutoff_days);

    Linear.linear = new Linear(graphClient, startDate, pageSize);
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

  private async errorWrapper<T>(func: () => Promise<T>): Promise<T> {
    let res: T;
    try {
      res = await func();
    } catch (err: any) {
      if (err.error_code || err.error_info) {
        throw new VError(`${err.error_code}: ${err.error_info}`);
      }
      let errorMessage;
      try {
        errorMessage = err.message ?? err.statusText ?? wrapApiError(err);
      } catch (wrapError: any) {
        errorMessage = wrapError.message;
      }
      throw new VError(errorMessage);
    }
    return res;
  }

  private async *paginate<T>(
    func: (pageInfo?: PageInfo) => Promise<PaginateResponse<T>>
  ): AsyncGenerator<T> {
    let fetchNextFunc: PageInfo = undefined;

    do {
      const response = await this.errorWrapper<PaginateResponse<T>>(() =>
        func(fetchNextFunc)
      );
      if (response?.pageInfo?.hasNextPage) fetchNextFunc = response?.pageInfo;
      else fetchNextFunc = null;

      for (const item of response?.data ?? []) {
        yield item;
      }
    } while (fetchNextFunc);
  }

  async *getUsers(): AsyncGenerator<User> {
    const data = await this.graphClient.request(USERS_QUERY, {});
    for (const node of data.users.nodes ?? []) {
      yield node;
    }
  }

  async *getProjects(): AsyncGenerator<Project> {
    const data = await this.graphClient.request(PROJECTS_QUERY, {});
    for (const node of data.projects.nodes ?? []) {
      yield node;
    }
  }

  async *getCycles(): AsyncGenerator<Cycle> {
    const data = await this.graphClient.request(CYCLES_QUERY, {});
    for (const node of data.cycles.nodes ?? []) {
      yield node;
    }
  }

  async *getTeams(): AsyncGenerator<Team> {
    const data = await this.graphClient.request(TEAMS_QUERY, {});
    for (const node of data.teams.nodes ?? []) {
      const team = {
        ...node,
      };
      team.members = node.members.nodes;
      yield team;
    }
  }

  async *getLabels(): AsyncGenerator<Label> {
    const data = await this.graphClient.request(LABELS_QUERY, {});
    for (const node of data.issueLabels.nodes ?? []) {
      yield node;
    }
  }

  async *getIssues(updatedAtFrom?: Date): AsyncGenerator<Issue> {
    const updatedAtFromMax =
      updatedAtFrom > this.startDate ? updatedAtFrom : this.startDate;
    const func = async (
      pageInfo?: PageInfo
    ): Promise<PaginateResponse<Issue>> => {
      const variables = {
        pageSize: this.pageSize,
        after: pageInfo ? pageInfo.endCursor : null,
        updatedAtFrom: updatedAtFromMax,
      };
      const data = await this.graphClient.request(ISSUES_QUERY, variables);

      return {
        data: data.issues?.edges.map((e) => {
          const node = e.node;
          if (e.cursor) node.cursor = e.cursor;

          node.history = node.history?.nodes;
          node.labels = node.labels?.nodes;
          return node;
        }),
        pageInfo: data.issues.pageInfo,
      };
    };
    yield* this.paginate(func);
  }
}
