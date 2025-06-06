import axios, {AxiosInstance, AxiosResponse} from 'axios';
import {AirbyteLogger} from 'faros-airbyte-cdk';
import VError from 'verror';

const DEFAULT_PAGE_SIZE = 20;
const BASE_URL = 'https://app.launchdarkly.com/api/v2';

export interface LaunchDarklyConfig {
  readonly token: string;
  readonly page_size?: number;
  readonly custom_streams?: ReadonlyArray<string>;
}

interface PaginatedResponse<T> {
  items: T[];
  _links: {
    first?: {href: string};
    prev?: {href: string};
    next?: {href: string};
    last?: {href: string};
  };
}

export class LaunchDarkly {
  private readonly client: AxiosInstance;

  constructor(
    readonly config: LaunchDarklyConfig,
    readonly logger: AirbyteLogger
  ) {
    this.client = axios.create({
      baseURL: BASE_URL,
      headers: {
        Authorization: config.token,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  }

  static instance(
    config: LaunchDarklyConfig,
    logger: AirbyteLogger
  ): LaunchDarkly {
    return new LaunchDarkly(config, logger);
  }

  async checkConnection(): Promise<void> {
    try {
      await this.client.get('/projects', {params: {limit: 1}});
    } catch (err: any) {
      throw new VError(err.message ?? JSON.stringify(err));
    }
  }

  async *getProjects(): AsyncGenerator<any, any, any> {
    yield* this.paginate('/projects');
  }

  async *getEnvironments(projectKey: string): AsyncGenerator<any, any, any> {
    yield* this.paginate(`/projects/${projectKey}/environments`);
  }

  async *getFeatureFlags(projectKey: string): AsyncGenerator<any, any, any> {
    yield* this.paginate(`/flags/${projectKey}`);
  }

  async *getUsers(
    projectKey: string,
    environmentKey: string
  ): AsyncGenerator<any, any, any> {
    yield* this.paginate(`/users/${projectKey}/${environmentKey}`);
  }

  async *getExperiments(projectKey: string): AsyncGenerator<any, any, any> {
    yield* this.paginate(`/projects/${projectKey}/experiments`);
  }

  private async *paginate<T>(
    endpoint: string,
    params: Record<string, any> = {}
  ): AsyncGenerator<T, any, any> {
    let url = endpoint;
    const pageSize = this.config.page_size ?? DEFAULT_PAGE_SIZE;

    do {
      try {
        const response: AxiosResponse<PaginatedResponse<T>> =
          await this.client.get(url, {
            params: {...params, limit: pageSize},
          });

        for (const item of response.data.items || []) {
          yield item;
        }

        const nextHref = response.data._links?.next?.href;
        if (nextHref && nextHref.startsWith('http')) {
          url = nextHref.replace(BASE_URL, '');
        } else {
          url = nextHref;
        }
      } catch (err: any) {
        if (err.response?.status === 429) {
          const retryAfter = err.response.headers['retry-after'] || 60;
          this.logger.warn(`Rate limited, waiting ${retryAfter} seconds`);
          await new Promise((resolve) =>
            setTimeout(resolve, retryAfter * 1000)
          );
          continue;
        }
        throw new VError(err.message ?? JSON.stringify(err));
      }
    } while (url);
  }
}
