import {AxiosInstance} from 'axios';
import {AirbyteLogger} from 'faros-airbyte-cdk';
import {makeAxiosInstanceWithRetry, wrapApiError} from 'faros-feeds-sdk';
import fs from 'fs-extra';
import {GraphQLClient} from 'graphql-request';
import path from 'path';
import {VError} from 'verror';

const DEFAULT_PAGE_SIZE = 10;
const DEFAULT_MAX_JOBS_PER_BUILD = 500;
const DEFAULT_REST_VERSION = 'v2';
const DEFAULT_GRAPHQL_VERSION = 'v1';
const REST_API_URL = 'https://api.buildkite.com/';
const GRAPHQL_API_URL = 'https://graphql.buildkite.com/';

const PIPELINES_QUERY = fs.readFileSync(
  path.join(__dirname, '..', '..', 'resources', 'gql', 'pipelines-query.gql'),
  'utf8'
);

const BUILDS_QUERY = fs.readFileSync(
  path.join(__dirname, '..', '..', 'resources', 'gql', 'builds-query.gql'),
  'utf8'
);

const JOBS_QUERY = fs.readFileSync(
  path.join(__dirname, '..', '..', 'resources', 'gql', 'jobs-query.gql'),
  'utf8'
);

export interface Organization {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly web_url: string;
}

export interface Build {
  readonly uuid: string;
  readonly number: number;
  readonly message: string;
  readonly createdAt?: string;
  readonly startedAt?: string;
  readonly finishedAt?: string;
  readonly state: string;
  readonly url: string;
  readonly commit: string;
  readonly jobs: Array<Job>;

  readonly pipeline?: {
    slug?: string;
    readonly organization?: {
      slug?: string;
    };
  };
}

export interface Job {
  readonly type: string;
  readonly uuid: string;
  readonly label?: string;
  readonly state: string;

  readonly createdAt?: string;
  readonly startedAt?: string;
  readonly finishedAt?: string;

  readonly triggered?: {
    startedAt?: string;
    createdAt?: string;
    finishedAt?: string;
  };
  readonly unblockedAt?: string;

  readonly url?: string;
  readonly command: string;

  readonly build?: {
    uuid?: string;
    readonly pipeline?: {
      readonly repository?: Repo;
      slug?: string;
      readonly organization?: {
        slug?: string;
      };
    };
  };
}

export interface Pipeline {
  readonly id: string;
  readonly uuid: string;
  readonly slug: string;
  readonly name: string;
  readonly url: string;
  readonly description?: string;
  readonly repository?: Repo;
  readonly createdAt?: string;
  readonly organization?: {
    slug?: string;
  };
}

export enum RepoSource {
  BITBUCKET = 'Bitbucket',
  GITHUB = 'GitHub',
  GITLAB = 'GitLab',
  VCS = 'VCS',
}

export interface Repo {
  readonly provider: Provider;
  readonly url: string;
}

export interface Provider {
  readonly name: RepoSource;
}

export interface BuildkiteConfig {
  readonly token: string;
  readonly page_size?: number;
  readonly max_jobs_per_build?: number;
  readonly organization?: string;
  readonly rest_api_version?: string;
  readonly graphql_version?: string;
}

interface PaginateResponse<T> {
  data: T[];
  pageInfo: PageInfo;
}

export interface PageInfo {
  hasNextPage: boolean;
  endCursor: string;
}

export class Buildkite {
  private static buildkite: Buildkite = null;

  constructor(
    private readonly graphClient: GraphQLClient,
    private readonly restClient: AxiosInstance,
    private readonly pageSize?: number,
    private readonly maxJobsPerBuild?: number,
    private readonly organization?: string
  ) {}

  static instance(config: BuildkiteConfig, logger: AirbyteLogger): Buildkite {
    if (Buildkite.buildkite) return Buildkite.buildkite;

    if (!config.token) {
      throw new VError('API Access token has to be provided');
    }
    const auth = `Bearer ${config.token}`;

    const graphqlVersion = config.graphql_version ?? DEFAULT_GRAPHQL_VERSION;
    const graphClient = new GraphQLClient(
      `${GRAPHQL_API_URL}${graphqlVersion}`,
      {
        headers: {authorization: auth},
      }
    );

    const restApiVersion = config.rest_api_version ?? DEFAULT_REST_VERSION;
    const restClient = makeAxiosInstanceWithRetry({
      baseURL: `${REST_API_URL}${restApiVersion}`,
      headers: {authorization: auth},
    });
    const pageSize = config.page_size ?? DEFAULT_PAGE_SIZE;
    const maxJobsPerBuild =
      config.max_jobs_per_build ?? DEFAULT_MAX_JOBS_PER_BUILD;

    Buildkite.buildkite = new Buildkite(
      graphClient,
      restClient,
      pageSize,
      maxJobsPerBuild,
      config.organization
    );
    logger.debug('Created Buildkite instance');
    return Buildkite.buildkite;
  }

  async checkConnection(): Promise<void> {
    try {
      await this.restClient.get(`/organizations`);
    } catch (err: any) {
      let errorMessage = 'Please verify your token is correct. Error: ';
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

      for (const item of response?.data ?? []) {
        yield item;
      }
    } while (fetchNextFunc);
  }

  async *getOrganizations(): AsyncGenerator<Organization> {
    if (this.organization) {
      const res = await this.restClient.get(
        `/organizations/${this.organization}`
      );
      yield res.data;
    } else {
      const res = await this.restClient.get<Organization[]>('organizations');
      for (const item of res.data) {
        yield item;
      }
    }
  }

  async *getPipelines(): AsyncGenerator<Pipeline> {
    if (this.organization) {
      yield* this.fetchOrganizationPipelines(this.organization);
    } else {
      const iterOrganizationItems = this.getOrganizations();
      for await (const organizationItem of iterOrganizationItems) {
        yield* this.fetchOrganizationPipelines(organizationItem.slug);
      }
    }
  }

  async *fetchOrganizationPipelines(
    organizationItemSlug: string
  ): AsyncGenerator<Pipeline> {
    const func = async (
      pageInfo?: PageInfo
    ): Promise<PaginateResponse<Pipeline>> => {
      const variables = {
        slug: organizationItemSlug,
        pageSize: this.pageSize,
        after: pageInfo?.endCursor,
      };
      const data = await this.graphClient.request(PIPELINES_QUERY, variables);

      return {
        data: data.organization.pipelines?.edges.map((e) => {
          return e.node;
        }),
        pageInfo: data.organization.pipelines.pageInfo,
      };
    };
    yield* this.paginate(func);
  }

  async *getBuilds(): AsyncGenerator<Build> {
    const variables = {
      maxBuilds: this.pageSize,
    };
    const data = await this.graphClient.request(BUILDS_QUERY, variables);
    for (const item of data.viewer.builds.edges) {
      yield item.node;
    }
  }

  async *getJobs(): AsyncGenerator<Job> {
    const func = async (
      pageInfo?: PageInfo
    ): Promise<PaginateResponse<Job>> => {
      const variables = {
        pageSize: this.pageSize,
        maxJobsPerBuild: this.maxJobsPerBuild,
        after: pageInfo?.endCursor,
      };
      const data = await this.graphClient.request(JOBS_QUERY, variables);

      return {
        data: data.viewer.jobs.edges.map((e) => {
          return e.node;
        }),
        pageInfo: data.viewer.job?.pageInfo,
      };
    };
    yield* this.paginate(func);
  }
}
