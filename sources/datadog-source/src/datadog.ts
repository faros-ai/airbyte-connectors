import {v2} from '@datadog/datadog-api-client';
import {AirbyteLogger} from 'faros-airbyte-cdk/lib';
import VError from 'verror';

const DEFAULT_PAGE_SIZE = 100;

interface PagedResult<T> {
  data: T[];
  meta?: {
    pagination?: {
      nextOffset?: number;
      offset?: number;
      size?: number;
    };
  };
}

export interface DataDogConfig {
  readonly apiKey: string;
  readonly applicationKey: string;
  readonly pageSize?: number;
}

interface DataDogClient {
  incidents: v2.IncidentsApi;
}

export class DataDog {
  private readonly client: DataDogClient;
  private readonly cfg: DataDogConfig;
  constructor(readonly config: DataDogConfig, readonly logger: AirbyteLogger) {
    const v2Config = v2.createConfiguration({
      authMethods: {
        apiKeyAuth: config.apiKey,
        appKeyAuth: config.applicationKey,
      },
    });

    // Beta endpoints are unstable and need to be explicitly enabled
    v2Config.unstableOperations['listIncidents'] = true;

    this.cfg = {
      ...config,
      pageSize: config.pageSize ?? DEFAULT_PAGE_SIZE,
    };
    this.client = {
      incidents: new v2.IncidentsApi(v2Config),
    };
  }

  async *getIncidents(
    lastModified?: Date,
    pageSize = this.cfg.pageSize
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

  async checkConnection(): Promise<void> {
    try {
      // Retrieve a single incident to verify API key and Application key
      await this.client.incidents.listIncidents({pageOffset: 0, pageSize: 1});
    } catch (err: any) {
      throw new VError(err.message ?? JSON.stringify(err));
    }
  }

  private async *paginate<T>(
    pageSize: number,
    fetch: (pageOffset?: number) => Promise<PagedResult<T>>,
    process: (data: T[]) => Promise<T[]>,
    earlyTermination = true
  ): AsyncGenerator<T, any, any> {
    let pageOffset = 0;
    let res: PagedResult<T> | undefined;
    do {
      try {
        res = await fetch(pageOffset);
      } catch (err: any) {
        throw new VError(err.message ?? JSON.stringify(err));
      }

      let count = 0;
      const processed = await process(res?.data ?? []);
      for (const item of processed) {
        if (item) {
          count++;
          yield item;
        }
      }

      if (earlyTermination && count < pageSize) return;
      pageOffset = res?.meta?.pagination?.nextOffset;
    } while (pageOffset);
  }
}
