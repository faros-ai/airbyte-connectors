import {v2} from '@datadog/datadog-api-client';
import {AirbyteLogger} from 'faros-airbyte-cdk';
import VError from 'verror';

const DEFAULT_PAGE_SIZE = 100;

interface PagedResult<T> {
  data?: Array<T>;
  meta?: {
    // Pagination for: Incidents
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

export interface DatadogConfig {
  readonly api_key: string;
  readonly application_key: string;
  readonly page_size?: number;
}

export interface DatadogClient {
  incidents: v2.IncidentsApi;
  users: v2.UsersApi;
}

export class Datadog {
  constructor(
    readonly client: DatadogClient,
    readonly config: DatadogConfig,
    readonly logger: AirbyteLogger
  ) {}

  static instance(config: DatadogConfig, logger: AirbyteLogger): Datadog {
    const v2Config = v2.createConfiguration({
      authMethods: {
        apiKeyAuth: config.api_key,
        appKeyAuth: config.application_key,
      },
    });

    // Beta endpoints are unstable and need to be explicitly enabled
    v2Config.unstableOperations['listIncidents'] = true;

    const client = {
      incidents: new v2.IncidentsApi(v2Config),
      users: new v2.UsersApi(v2Config),
    };

    return new Datadog(client, config, logger);
  }

  async checkConnection(): Promise<void> {
    try {
      // Retrieve a single user to verify API key and Application key
      await this.client.users.listUsers({pageSize: 1});
    } catch (err: any) {
      throw new VError(err.message ?? JSON.stringify(err));
    }
  }

  // Retrieve incidents that have been modified since lastModified
  // or retrieve all incidents if lastModified not set
  // Note: This is an unstable endpoint
  async *getIncidents(
    lastModified?: Date,
    pageSize = this.config.page_size ?? DEFAULT_PAGE_SIZE
  ): AsyncGenerator<v2.IncidentResponseData, any, any> {
    yield* this.paginate<v2.IncidentResponseData>(
      pageSize,
      async (pageOffset) => {
        try {
          const incidents = await this.client.incidents.listIncidents({
            pageOffset,
            pageSize,
          });
          return incidents;
        } catch (err: any) {
          if (err?.code === 404) {
            this.logger.warn(
              'Received response 404 when listing incidents. Your Datadog account may not have incidents enabled.'
            );
            return undefined;
          } else {
            throw err;
          }
        }
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

  // Retrieve users that have been modified since lastModifiedAt
  // or retrieve all users if lastModifiedAt not set
  async *getUsers(
    lastModifiedAt?: Date,
    pageSize = this.config.page_size ?? DEFAULT_PAGE_SIZE
  ): AsyncGenerator<v2.User, any, any> {
    yield* this.paginate<v2.User>(
      pageSize,
      async (pageNumber) => {
        return this.client.users.listUsers({
          pageNumber,
          pageSize,
        });
      },
      async (data) => {
        const issues = [];
        for (const issue of data) {
          const modifiedAt = issue?.attributes?.modifiedAt;
          if (
            !lastModifiedAt ||
            (modifiedAt &&
              new Date(modifiedAt).getTime() >
                new Date(lastModifiedAt).getTime())
          ) {
            issues.push(issue);
          }
        }
        return issues;
      }
    );
  }

  private async *paginate<T>(
    pageSize: number,
    fetch: (offset: number) => Promise<PagedResult<T> | undefined>,
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

      if (!res) return;
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
        offset = nextOffset; // represents item offset
      } else if (totalCount) {
        // Paginate using res.meta.page
        // Calculate if totalCount has been reached across retrieved pages
        if (pageSize * (offset + 1) >= totalCount) {
          return;
        }
        offset++; // represents page number
      } else {
        throw new VError('Response could not be paginated');
      }
    } while (offset);
  }
}
