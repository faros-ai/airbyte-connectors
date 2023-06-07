import {client, v1, v2} from '@datadog/datadog-api-client';
import {AirbyteLogger} from 'faros-airbyte-cdk';
import VError from 'verror';

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_SITE = 'datadoghq.com'; // See - https://docs.datadoghq.com/getting_started/site/

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

export interface MetricPoint {
  id: string;
  queryHash: string;
  displayName: string;
  metric: string;
  timestamp: number;
  value: number;
  primaryUnit?: v1.MetricsQueryUnit;
  perUnit?: v1.MetricsQueryUnit;
  scope: string;
  tagSet: Array<string>;
}

export interface DatadogConfig {
  readonly api_key: string;
  readonly application_key: string;
  readonly page_size?: number;
  readonly metrics?: Array<string>;
  readonly metrics_max_window?: number;
  readonly site?: string;
}

export interface DatadogClient {
  incidents: v2.IncidentsApi;
  metrics: v1.MetricsApi;
  users: v2.UsersApi;
}

export class Datadog {
  constructor(
    readonly client: DatadogClient,
    readonly config: DatadogConfig,
    readonly logger: AirbyteLogger
  ) {}

  static instance(config: DatadogConfig, logger: AirbyteLogger): Datadog {
    const configurationOpts = {
      authMethods: {
        apiKeyAuth: config.api_key,
        appKeyAuth: config.application_key,
      },
    };

    const clientConfig = client.createConfiguration(configurationOpts);

    // Add ability to change sites to other regions.
    client.setServerVariables(clientConfig, {
      site: config.site ?? DEFAULT_SITE,
    });

    // Beta endpoints are unstable and need to be explicitly enabled
    clientConfig.unstableOperations['v2.listIncidents'] = true;

    const newClient = {
      incidents: new v2.IncidentsApi(clientConfig),
      metrics: new v1.MetricsApi(clientConfig),
      users: new v2.UsersApi(clientConfig),
    };

    return new Datadog(newClient, config, logger);
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

  // Retrieve the specified metric between from and to unix timestamps
  async *getMetrics(
    query: string,
    queryHash: string,
    from: number,
    to: number
  ): AsyncGenerator<MetricPoint, any, any> {
    try {
      const res = await this.client.metrics.queryMetrics({
        from,
        to,
        query: query,
      });
      for (const metadata of res.series) {
        for (const point of metadata.pointlist) {
          yield {
            id: `${queryHash}-${metadata.metric}-${point[0]}`,
            queryHash,
            displayName: metadata.displayName,
            metric: metadata.metric,
            timestamp: point[0],
            value: point[1],
            primaryUnit:
              Array.isArray(metadata.unit) && metadata.unit.length > 0
                ? metadata.unit[0]
                : undefined,
            perUnit:
              Array.isArray(metadata.unit) && metadata.unit.length > 1
                ? metadata.unit[1]
                : undefined,
            scope: metadata.scope,
            tagSet: metadata.tagSet,
          };
        }
      }
    } catch (err: any) {
      throw new VError(err.message ?? JSON.stringify(err));
    }
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
