import {v2} from '@datadog/datadog-api-client';
import {AirbyteLogger} from 'faros-airbyte-cdk/lib';
import VError from 'verror';

const DEFAULT_PAGE_SIZE = 100;

interface PagedResult<T> {
  data?: Array<T>;
  meta?: {
    // Pagination for: Issues
    pagination?: {
      nextOffset?: number;
      offset?: number;
      size?: number;
    };
    // Pagination for: Users
    page?: {
      totalCount?: number;
      totalFilteredCount?: number;
    };
  };
}

export interface DataDogConfig {
  readonly apiKey: string;
  readonly applicationKey: string;
  readonly pageSize?: number;
}

export interface DataDogClient {
  incidents: v2.IncidentsApi;
  users: v2.UsersApi;
}

export class DataDog {
  constructor(
    readonly client: DataDogClient,
    readonly config: DataDogConfig,
    readonly logger: AirbyteLogger
  ) {}

  static instance(config: DataDogConfig, logger: AirbyteLogger): DataDog {
    const v2Config = v2.createConfiguration({
      authMethods: {
        apiKeyAuth: config.apiKey,
        appKeyAuth: config.applicationKey,
      },
    });

    // Beta endpoints are unstable and need to be explicitly enabled
    v2Config.unstableOperations['listIncidents'] = true;

    const client = {
      incidents: new v2.IncidentsApi(v2Config),
      users: new v2.UsersApi(v2Config),
    };

    return new DataDog(client, config, logger);
  }

  async checkConnection(): Promise<void> {
    try {
      // Retrieve a single incident to verify API key and Application key
      await this.client.incidents.listIncidents({pageOffset: 0, pageSize: 1});
    } catch (err: any) {
      throw new VError(err.message ?? JSON.stringify(err));
    }
  }

  // Retrieve incidents that have been modified since lastModified
  // or retrieve all incidents if lastModified not set.
  // Note: This is an unstable endpoint
  async *getIncidents(
    lastModified?: Date,
    pageSize = this.config.pageSize ?? DEFAULT_PAGE_SIZE
  ): AsyncGenerator<v2.IncidentResponseData, any, any> {
    yield* this.paginate<v2.IncidentResponseData>(
      pageSize,
      async (pageOffset) => {
        return this.client.incidents.listIncidents({
          pageOffset,
          pageSize,
        });
      },
      async (data) => {
        const issues = [];
        for (const issue of data) {
          const modified = issue?.attributes?.modified;
          if (
            !lastModified ||
            (modified &&
              new Date(modified).getTime() > new Date(lastModified).getTime())
          ) {
            issues.push(issue);
          }
        }
        return issues;
      }
    );
  }

  // Retrieve all users
  async *getUsers(
    pageSize = this.config.pageSize ?? DEFAULT_PAGE_SIZE
  ): AsyncGenerator<v2.User, any, any> {
    yield* this.paginate<v2.User>(
      pageSize,
      async (offset) => {
        return this.client.users.listUsers({
          pageNumber: offset,
          pageSize,
        });
      },
      async (data) => data
    );
  }

  private async *paginate<T>(
    pageSize: number,
    fetch: (offset: number) => Promise<PagedResult<T>>,
    process: (data: T[]) => Promise<T[]>
  ): AsyncGenerator<T, any, any> {
    let offset = 0;
    let res: PagedResult<T> | undefined;
    do {
      try {
        res = await fetch(offset);
      } catch (err: any) {
        throw new VError(err.message ?? JSON.stringify(err));
      }

      const processed = await process(res?.data ?? []);
      for (const item of processed) {
        if (item) {
          yield item;
        }
      }

      const size = res?.meta?.pagination?.size;
      const nextOffset = res?.meta?.pagination?.nextOffset;
      const totalCount = res?.meta?.page?.totalCount;
      if (size && nextOffset) {
        // Paginate using res.meta.pagination
        if (size < pageSize || offset === nextOffset) {
          return;
        }
        offset = nextOffset;
      } else if (totalCount) {
        // Paginate using res.meta.page
        if (pageSize * (offset + 1) >= totalCount) {
          return;
        }
        offset++;
      } else {
        throw new VError('Response could not be paginated');
      }
    } while (offset);
  }
}
