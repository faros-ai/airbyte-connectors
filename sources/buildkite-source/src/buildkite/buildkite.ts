import axios, {AxiosInstance, AxiosResponse} from 'axios';
import {AirbyteLogger} from 'faros-airbyte-cdk';
import {makeAxiosInstanceWithRetry, wrapApiError} from 'faros-feeds-sdk';
import fs from 'fs-extra';
import parseGitUrl from 'git-url-parse';
import {gql, GraphQLClient} from 'graphql-request';
import {Memoize} from 'typescript-memoize';
import {VError} from 'verror';

import {Jobs, Pipelines} from '../streams';

const DEFAULT_PAGE_SIZE = 10;
const DEFAULT_MAX_JOBS_PER_BUILD = 500;
const REST_API_URL = 'https://api.buildkite.com/v2';
const GRAPHQL_API_URL = 'https://graphql.buildkite.com/v1';

export interface Build {
  readonly uid: string;
  readonly number: number;
  readonly createdAt?: Date;
  readonly startedAt?: Date;
  readonly finishedAt?: Date;
  readonly state: string;
  readonly url: string;
  readonly commit: string;
  readonly jobs: Array<Job>;
}
// Jobs
export interface Job {
  readonly uuid: string;
  readonly label?: string;
  readonly state: string;
  readonly createdAt?: Date;
  readonly startedAt?: Date;
  readonly finishedAt?: Date;
  readonly url?: string;
  readonly command: string;
}
export interface Organization {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
}

export interface Pipeline {
  readonly id: string;
  readonly uuid: string;
  readonly slug: string;
  readonly name: string;
  readonly url: string;
  readonly description?: string;
  readonly repository?: Repo;
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
}
interface PaginateResponse<T> {
  data: T[];
  pageInfo: PageInfo;
}
export interface PageInfo {
  hasNextPage: boolean;
  endCursor: string;
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
  private readGQLFile(fileName: string): any {
    return fs.readFileSync(`resources/${fileName}`, 'utf8');
  }
  async *getOrganizations(): AsyncGenerator<Organization> {
    const gqlFile = this.readGQLFile('organizations-query.gql');
    const query = gql`
      ${gqlFile}
    `;
    const data = await this.graphClient.request(query);

    for (const item of data.data.viewer.organizations.edges) {
      yield item.node;
    }
  }
  @Memoize((cutoff: Date) => cutoff ?? new Date(0))
  async *getPipelines(cutoff?: Date): AsyncGenerator<Pipeline> {
    const iterOrganizations = this.getOrganizations();
    for await (const organization of iterOrganizations) {
      yield* this.fetchOrganizationPipelines(organization, cutoff);
    }
  }

  async *fetchOrganizationPipelines(
    organization: Organization,
    cutoff?: Date
  ): AsyncGenerator<Pipeline> {
    const gqlFile = this.readGQLFile('pipelines-query.gql');
    const query = gql`
      ${gqlFile}
    `;

    const func = async (
      pageInfo?: PageInfo
    ): Promise<PaginateResponse<Pipeline>> => {
      const variables = {
        slug: organization.slug,
        pageSize: this.pageSize,
        after: pageInfo.endCursor,
        createdAtFrom: cutoff,
      };
      const data = await this.graphClient.request(query, variables);
      return {
        data: data.data.organization.pipelines.edges.map((e) => {
          return e.node;
        }),
        pageInfo: data.data.organization.pipelines.pageInfo,
      };
    };
    yield* this.paginate(func);
  }
  async *getBuilds(cutoff?: Date): AsyncGenerator<Build> {
    const iterPipilines = this.getPipelines();
    for await (const pipeline of iterPipilines) {
      yield* this.fetchPipelineBuilds(pipeline, cutoff);
    }
  }

  async *fetchPipelineBuilds(
    pipeline: Pipeline,
    cutoff?: Date
  ): AsyncGenerator<Build> {
    const gqlFile = this.readGQLFile('pipelines-query.gql');
    const query = gql`
      ${gqlFile}
    `;
    const func = async (
      pageInfo?: PageInfo
    ): Promise<PaginateResponse<Build>> => {
      const variables = {
        slug: pipeline.url.replace('https://buildkite.com/', ''),
        pageSize: this.pageSize,
        maxJobsPerBuild: this.maxJobsPerBuild,
        after: pageInfo.endCursor,
        createdAtFrom: cutoff,
      };
      const data = await this.graphClient.request(query, variables);
      return {
        data: data.data.pipeline.builds.edges.map((e) => {
          e.jobs = e.jobs.edges.map((ee) => {
            return ee;
          });
          return e.node;
        }),
        pageInfo: data.data.pipeline.builds.pageInfo,
      };
    };
    yield* this.paginate(func);
  }
  async *getJobs(): AsyncGenerator<Job> {
    const iterBuilds = this.getBuilds();
    for await (const build of iterBuilds) {
      for await (const job of build.jobs) {
        yield job;
      }
    }
  }

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
