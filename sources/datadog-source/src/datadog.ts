import {client, v1, v2} from '@datadog/datadog-api-client';
import {AirbyteLogger} from 'faros-airbyte-cdk';
import VError from 'verror';

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_SITE = 'datadoghq.com'; // See - https://docs.datadoghq.com/getting_started/site/

type Pagination =
  | v2.IncidentResponseMetaPagination
  | v1.SearchSLOResponseMetaPage;

interface PagedResult<T> {
  data?: Array<T>;
  meta?: {
    // Pagination for: Incidents
    pagination?: Pagination;
    // Pagination for: Users
    page?: v2.Pagination;
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
  slos: v1.ServiceLevelObjectivesApi;
  users: v2.UsersApi;
}

export class Datadog {
  constructor(
    readonly client: DatadogClient,
    readonly pageSize: number,
    readonly config: DatadogConfig,
    readonly logger: AirbyteLogger
  ) {}

  static instance(config: DatadogConfig, logger: AirbyteLogger): Datadog {
    const configurationOpts = {
      authMethods: {
        apiKeyAuth: config.api_key,
        appKeyAuth: config.application_key,
      },
      enableRetry: true,
    };

    const clientConfig = client.createConfiguration(configurationOpts);

    // Add ability to change sites to other regions.
    clientConfig.setServerVariables({
      site: config.site ?? DEFAULT_SITE,
    });

    // Beta endpoints are unstable and need to be explicitly enabled
    clientConfig.unstableOperations['v2.listIncidents'] = true;

    const newClient = {
      incidents: new v2.IncidentsApi(clientConfig),
      metrics: new v1.MetricsApi(clientConfig),
      slos: new v1.ServiceLevelObjectivesApi(clientConfig),
      users: new v2.UsersApi(clientConfig),
    };

    return new Datadog(
      newClient,
      config.page_size ?? DEFAULT_PAGE_SIZE,
      config,
      logger
    );
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
    pageSize = this.pageSize
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
    pageSize = this.pageSize
  ): AsyncGenerator<v2.User, any, any> {
    yield* this.paginate<v2.User>(
      pageSize,
      async (pageNumber) => {
        const res = await this.client.users.listUsers({
          pageNumber,
          pageSize,
        });
        return res;
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

  async *getServiceLevelObjectivess(
    pageSize = this.pageSize
  ): AsyncGenerator<v1.SearchServiceLevelObjectiveData, any, any> {
    yield* this.paginate<v1.SearchServiceLevelObjectiveData>(
      pageSize,
      async (pageNumber) => {
        try {
          const res = await this.client.slos.searchSLO({pageSize, pageNumber});
          const slos = res.data?.attributes?.slos?.map((slo) => slo.data) ?? [];
          return {meta: res.meta, data: slos};
        } catch (err: any) {
          if (err?.code === 403) {
            this.logger.warn(
              'Received response 403 when listing SLOs. Ensure your ' +
                'Application key and/or API key have the `slos_read` permissions.'
            );
            return undefined;
          } else {
            throw err;
          }
        }
      },
      async (data) => data
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

      if (res?.meta?.pagination) {
        offset = this.getPaginationOffset(res.meta.pagination, pageSize);
      } else if (res?.meta?.page) {
        offset = this.getPageOffset(res.meta.page, offset, pageSize);
      } else {
        throw new VError('Response could not be paginated');
      }
    } while (offset);
  }

  private getPaginationOffset(
    pagination: Pagination,
    pageSize: number
  ): number {
    if (pagination instanceof v2.IncidentResponseMetaPagination) {
      const size = pagination.size;
      const nextOffset = pagination.nextOffset;
      const offset = pagination.offset;

      if (size && nextOffset) {
        if (size < pageSize || offset === nextOffset) {
          return;
        }
        return nextOffset; // represents item offset
      }
    }

    if (pagination instanceof v1.SearchSLOResponseMetaPage) {
      return this.getNumberSizeOffset(pagination);
    }

    throw new VError(
      `Failed to get offset from pagination response: ${JSON.stringify(
        pagination
      )}`
    );
  }

  private getPageOffset(
    page: v2.Pagination,
    offset: number,
    pageSize: number
  ): number {
    const totalCount = page.totalCount;
    if (totalCount) {
      // Calculate if totalCount has been reached across retrieved pages
      if (pageSize * (offset + 1) >= totalCount) {
        return;
      }
      const nextPage = offset + 1; // represents page number
      return nextPage;
    }

    throw new VError(
      `Failed to get offset from page response: ${JSON.stringify(page)}`
    );
  }

  /**
   * Get the offset for the next page of SLOs for the number_type pagination
   * @param pagination - The pagination object
   * @returns The offset for the next page of SLOs
   */
  private getNumberSizeOffset(
    pagination: v1.SearchSLOResponseMetaPage
  ): number {
    const number = pagination.number; // Current page number
    const lastNumber = pagination.lastNumber; // Last page number

    if (isFinite(lastNumber) && isFinite(number)) {
      if (number < lastNumber) {
        return pagination.nextNumber; // Next page number
      }
      return;
    }

    throw new VError(
      `Failed to get offset from number_type pagination response: ` +
        `${JSON.stringify(pagination)}`
    );
  }
}
