import axios, {AxiosInstance, AxiosResponse} from 'axios';
import {AirbyteLogger} from 'faros-airbyte-cdk';
import {makeAxiosInstanceWithRetry, wrapApiError} from 'faros-feeds-sdk';
import parseGitUrl from 'git-url-parse';
import {GraphQLClient} from 'graphql-request';
import {Memoize} from 'typescript-memoize';
import {VError} from 'verror';

const DEFAULT_PAGE_SIZE = 10;
const DEFAULT_MAX_JOBS_PER_BUILD = 500;
const REST_API_URL = 'https://api.buildkite.com/v2';
const GRAPHQL_API_URL = 'https://graphql.buildkite.com/v1';

export interface Build {
  readonly uid: string;
  // readonly name: string;
  readonly number: number;
  readonly createdAt?: Date;
  readonly startedAt?: Date;
  readonly finishedAt?: Date;
  readonly state: string;
  readonly url: string;
  readonly commit: string;
  readonly jobs: Array<BuildStep>;
}

export interface BuildStep {
  readonly uid: string;
  readonly name?: string;
  readonly command?: string;
  readonly type: string;
  readonly createdAt?: Date;
  readonly startedAt?: Date;
  readonly finishedAt?: Date;
  readonly triggered?: {
    startedAt?: Date;
    createdAt?: Date;
    finishedAt?: Date;
  };
  readonly unblockedAt?: Date;
  readonly state: string;
  readonly url?: string;
  readonly build: string;
}

export interface Organization {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  // readonly web_url: string;
}

export interface Pipeline {
  readonly slug: string;
  readonly name: string;
  readonly description?: string;
  readonly createdAt?: string;
  readonly url: string;
  readonly repo?: Repo;
}

export enum RepoSource {
  BITBUCKET = 'Bitbucket',
  GITHUB = 'GitHub',
  GITLAB = 'GitLab',
  VCS = 'VCS',
}

export interface Repo {
  readonly source: RepoSource;
  readonly org: string;
  readonly name: string;
}

export interface BuildkiteConfig {
  readonly token: string;
  readonly page_size?: number;
  readonly max_jobs_per_build?: number;
}

interface BuildkiteResponse<Type> {
  status: number;
  statusText: string;
  resource: Type[];
  next?: () => Promise<BuildkiteResponse<Type>>;
}

interface BuildkiteGraphQLOptions {
  after?: string;
  pageSize?: number;
}

export class Buildkite {
  private static buildkite: Buildkite = null;

  constructor(
    private readonly graphClient: GraphQLClient,
    private readonly restClient: AxiosInstance,
    private readonly pageSize: number,
    private readonly maxJobsPerBuild: number
  ) {}

  static instance(config: BuildkiteConfig, logger: AirbyteLogger): Buildkite {
    if (Buildkite.buildkite) return Buildkite.buildkite;

    if (!config.token) {
      throw new VError('API Access token has to be provided');
    }
    const auth = `Bearer ${config.token}`;

    const graphClient = new GraphQLClient(`${GRAPHQL_API_URL}`, {
      headers: {authorization: auth},
    });
    const restClient = makeAxiosInstanceWithRetry({
      baseURL: `${REST_API_URL}`,
      headers: {authorization: auth},
    });
    const pageSize = config.page_size ?? DEFAULT_PAGE_SIZE;
    const maxJobsPerBuild =
      config.max_jobs_per_build ?? DEFAULT_MAX_JOBS_PER_BUILD;

    Buildkite.buildkite = new Buildkite(
      graphClient,
      restClient,
      pageSize,
      maxJobsPerBuild
    );
    logger.debug('Created Buildkite instance');

    return Buildkite.buildkite;
  }

  async checkConnection(): Promise<void> {
    try {
      await this.restClient.get(`/organizations`);
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

  // private async *paginate<T>(
  //   func: () => Promise<PagerdutyResponse<T>>,
  //   broker: (item: T) => boolean = (): boolean => false
  // ): AsyncGenerator<T> {
  //   let response = await this.errorWrapper<PagerdutyResponse<T>>(func);
  //   let fetchNextFunc;

  //   do {
  //     if (response?.status >= 300) {
  //       throw new VError(`${response?.status}: ${response?.statusText}`);
  //     }
  //     if (response?.next) fetchNextFunc = response?.next;

  //     for (const item of response?.resource ?? []) {
  //       const stopReading = broker(item);
  //       if (stopReading) {
  //         return undefined;
  //       }
  //       yield item;
  //     }
  //     response = response.next
  //       ? await this.errorWrapper<PagerdutyResponse<T>>(fetchNextFunc)
  //       : undefined;
  //   } while (response);
  // }

  // @Memoize((query: string) => query)
  // private async *graphQLRequest(
  //   query: string,
  //   opts: BuildkiteGraphQLOptions = {}
  // ): AsyncGenerator<T> {
  //   const {organization} = await this.graphClient.request(query, {
  //     ...opts,
  //     pageSize: opts?.pageSize || this.pageSize,
  //   });

  //   const pipelines = organization.pipelines.edges.map((p) => {
  //     const pipeline = p.node;
  //     const repo = this.extractRepo(
  //       pipeline.repository.provider.name,
  //       pipeline.repository.url
  //     );
  //     return {
  //       slug: pipeline.slug,
  //       name: pipeline.name,
  //       url: pipeline.url,
  //       repo,
  //     };
  //   });
  //   const pageInfo = organization.pipelines.pageInfo;
  //   const nextCursor = pageInfo.hasNextPage ? pageInfo.endCursor : undefined;

  //   yield {pipelines, nextCursor};
  // }
}
