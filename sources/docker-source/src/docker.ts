import * as dockerRegistry from '@snyk/docker-registry-v2-client';
import {AirbyteLogger, toDate, wrapApiError} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';
import {Memoize} from 'typescript-memoize';
import {VError} from 'verror';

const DEFAULT_REGISTRY_BASE = 'registry-1.docker.io';
const DEFAULT_MAX_PAGES = 5;
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_AUTH_ENDPOINT = '/tags/list';

type DockerCredentials = {username: string; password: string};

interface ImageConfigContainer {
  Labels: Record<string, string>;
}

interface ImageConfig {
  config: ImageConfigContainer;
  created: string;
}

export interface Tag {
  name: string;
  projectName: string;
  imageConfig?: ImageConfig;
  imageManifest?: dockerRegistry.types.ImageManifest;
}

interface RequestOptions {
  headers: {
    Authorization?: string;
  };
}

export interface DockerConfig {
  readonly username: string;
  readonly password: string;
  readonly repositories: string;
  readonly cutoffDays: number;
  readonly authEndpoint?: string;
  readonly bearerAuthorization?: boolean;
  readonly registryBase?: string;
  readonly pageSize?: number;
  readonly maxPages?: number;
  /** Property added on the run time */
  readonly projectName?: string;
}

export class Docker {
  private static clients: Dictionary<Docker, string> = {};

  constructor(
    private readonly registryBase: string,
    private readonly startDate: Date,
    private readonly pageSize: number,
    private readonly maxPages: number,
    private readonly options: RequestOptions,
    private readonly auth?: DockerCredentials
  ) {}

  static async instance(
    config: DockerConfig,
    logger: AirbyteLogger
  ): Promise<Docker> {
    const client = this.clients[config.projectName];
    if (client) return client;

    if (!config.username) {
      throw new VError(
        'Missing authentication information. Please provide a Docker username'
      );
    }
    if (!config.password) {
      throw new VError(
        'Missing authentication information. Please provide a Docker password'
      );
    }
    if (!config.projectName) {
      throw new VError(
        'Missing authentication information. Please provide a Docker project name'
      );
    }
    if (!config.cutoffDays || config.cutoffDays < 1) {
      throw new VError('Cutoff Days must be at least 1');
    }

    const registryBase = config.registryBase || DEFAULT_REGISTRY_BASE;
    const pageSize = config.pageSize || DEFAULT_PAGE_SIZE;
    const maxPage = config.maxPages || DEFAULT_MAX_PAGES;
    const token = await this.getAuthToken(config);

    const options: RequestOptions = {headers: {}};
    let auth: DockerCredentials | undefined = undefined;

    if (token && config.bearerAuthorization) {
      options.headers.Authorization = `Bearer ${token}`;
    } else {
      auth = {username: config.username, password: config.password};
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - config.cutoffDays);
    Docker.clients[config.projectName] = new Docker(
      registryBase,
      startDate,
      pageSize,
      maxPage,
      options,
      auth
    );
    return Docker.clients[config.projectName];
  }

  protected static getAuthToken(config: DockerConfig): Promise<string> {
    const authEndpoint = config.authEndpoint || DEFAULT_AUTH_ENDPOINT;
    const authPath = `/${config.projectName}${authEndpoint}`;
    const registryBase = config.registryBase || DEFAULT_REGISTRY_BASE;

    return dockerRegistry.getAuthTokenForEndpoint(
      registryBase,
      authPath,
      config.username,
      config.password
    );
  }

  async checkConnection(config: DockerConfig): Promise<void> {
    try {
      await Docker.getAuthToken(config);
    } catch (err: any) {
      let errorMessage =
        'Please verify your username and password are correct. Error: ';
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

  @Memoize((repo: string, lastCreatedAt?: Date): string =>
    repo.concat(lastCreatedAt?.toISOString())
  )
  async getTags(
    repo: string,
    lastCreatedAt: Date = this.startDate
  ): Promise<ReadonlyArray<Tag>> {
    const results: Tag[] = [];
    const res = await dockerRegistry.getTags(
      this.registryBase,
      repo,
      this.auth?.username,
      this.auth?.password,
      this.pageSize,
      this.maxPages,
      this.options
    );

    for await (const item of res) {
      const imageManifest = await this.getManifest(repo, item);
      const imageConfig = await this.getImageConfig(
        repo,
        imageManifest.config.digest
      );
      const created = toDate(imageConfig.created);
      if (created <= lastCreatedAt) {
        continue;
      }
      results.push({
        name: item,
        projectName: repo,
        imageConfig,
        imageManifest,
      });
    }
    return results;
  }

  @Memoize((repo: string, digest: string): string => repo.concat(digest))
  private getImageConfig(repo: string, digest: string): Promise<ImageConfig> {
    return dockerRegistry.getImageConfig(
      this.registryBase,
      repo,
      digest,
      this.auth?.username,
      this.auth?.password,
      this.options
    );
  }

  @Memoize((repo: string, tag: string): string => repo.concat(tag))
  private getManifest(
    repo: string,
    tag: string
  ): Promise<dockerRegistry.types.ImageManifest> {
    return dockerRegistry.getManifest(
      this.registryBase,
      repo,
      tag,
      this.auth?.username,
      this.auth?.password,
      this.options
    );
  }
}
