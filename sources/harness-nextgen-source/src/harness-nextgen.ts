import axios, {AxiosInstance} from 'axios';
import {AirbyteLogger, wrapApiError} from 'faros-airbyte-cdk';
import VError from 'verror';

import {
  Environment,
  Execution,
  ExecutionListResponse,
  HarnessNextgenConfig,
  Organization,
  PaginatedResponse,
  Pipeline,
  Project,
  Service,
} from './types';

const DEFAULT_HARNESS_API_URL = 'https://app.harness.io';
const DEFAULT_PAGE_SIZE = 100;

export class HarnessNextgen {
  private static instance_: HarnessNextgen = null;
  private readonly client: AxiosInstance;
  private readonly pageSize: number;
  private readonly startDate: Date;

  constructor(
    client: AxiosInstance,
    pageSize: number,
    startDate: Date,
    readonly logger: AirbyteLogger
  ) {
    this.client = client;
    this.pageSize = pageSize;
    this.startDate = startDate;
  }

  static instance(
    config: HarnessNextgenConfig,
    logger: AirbyteLogger
  ): HarnessNextgen {
    if (HarnessNextgen.instance_) return HarnessNextgen.instance_;

    if (!config.account_id) {
      throw new VError(
        'Missing authentication information. Please provide a Harness accountId'
      );
    }
    if (!config.api_key) {
      throw new VError(
        'Missing authentication information. Please provide a Harness apiKey'
      );
    }
    if (!config.cutoff_days) {
      throw new VError('cutoff_days is null or empty');
    }

    const apiUrl = config.api_url || DEFAULT_HARNESS_API_URL;
    const pageSize = config.page_size || DEFAULT_PAGE_SIZE;

    const client = axios.create({
      baseURL: apiUrl,
      headers: {
        'x-api-key': config.api_key,
        'Harness-Account': config.account_id,
        'Content-Type': 'application/json',
      },
    });

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - config.cutoff_days);

    HarnessNextgen.instance_ = new HarnessNextgen(
      client,
      pageSize,
      startDate,
      logger
    );
    return HarnessNextgen.instance_;
  }

  async checkConnection(): Promise<void> {
    try {
      await this.client.get('/ng/api/organizations', {
        params: {pageSize: 1, pageIndex: 0},
      });
    } catch (err: any) {
      throw wrapApiError(err, 'Failed to connect to Harness NextGen API');
    }
  }

  async *getOrganizations(
    orgIds?: string[]
  ): AsyncGenerator<Organization> {
    let pageIndex = 0;
    let hasMore = true;

    while (hasMore) {
      try {
        const response = await this.client.get<PaginatedResponse<Organization>>(
          '/ng/api/organizations',
          {
            params: {
              pageSize: this.pageSize,
              pageIndex,
            },
          }
        );

        const data = response.data?.data;
        if (!data?.content || data.content.length === 0) {
          hasMore = false;
          break;
        }

        for (const org of data.content) {
          if (!orgIds || orgIds.length === 0 || orgIds.includes(org.identifier)) {
            yield org;
          }
        }

        hasMore = !data.last && data.content.length === this.pageSize;
        pageIndex++;
      } catch (err: any) {
        throw wrapApiError(err, 'Failed to fetch organizations');
      }
    }
  }

  async *getProjects(
    orgIdentifier: string,
    projectIds?: string[]
  ): AsyncGenerator<Project> {
    let pageIndex = 0;
    let hasMore = true;

    while (hasMore) {
      try {
        const response = await this.client.get<PaginatedResponse<Project>>(
          '/ng/api/projects',
          {
            params: {
              orgIdentifier,
              pageSize: this.pageSize,
              pageIndex,
            },
          }
        );

        const data = response.data?.data;
        if (!data?.content || data.content.length === 0) {
          hasMore = false;
          break;
        }

        for (const project of data.content) {
          if (
            !projectIds ||
            projectIds.length === 0 ||
            projectIds.includes(project.identifier)
          ) {
            yield {
              ...project,
              orgIdentifier,
            };
          }
        }

        hasMore = !data.last && data.content.length === this.pageSize;
        pageIndex++;
      } catch (err: any) {
        throw wrapApiError(
          err,
          `Failed to fetch projects for org ${orgIdentifier}`
        );
      }
    }
  }

  async *getPipelines(
    orgIdentifier: string,
    projectIdentifier: string
  ): AsyncGenerator<Pipeline> {
    let pageIndex = 0;
    let hasMore = true;

    while (hasMore) {
      try {
        const response = await this.client.post<PaginatedResponse<Pipeline>>(
          `/pipeline/api/pipelines/list`,
          {
            filterType: 'PipelineSetup',
          },
          {
            params: {
              accountIdentifier: this.client.defaults.headers['Harness-Account'],
              orgIdentifier,
              projectIdentifier,
              page: pageIndex,
              size: this.pageSize,
            },
          }
        );

        const data = response.data?.data;
        if (!data?.content || data.content.length === 0) {
          hasMore = false;
          break;
        }

        for (const pipeline of data.content) {
          yield {
            ...pipeline,
            orgIdentifier,
            projectIdentifier,
          };
        }

        hasMore = !data.last && data.content.length === this.pageSize;
        pageIndex++;
      } catch (err: any) {
        throw wrapApiError(
          err,
          `Failed to fetch pipelines for project ${projectIdentifier}`
        );
      }
    }
  }

  async *getServices(
    orgIdentifier: string,
    projectIdentifier: string
  ): AsyncGenerator<Service> {
    let pageIndex = 0;
    let hasMore = true;

    while (hasMore) {
      try {
        const response = await this.client.get<PaginatedResponse<Service>>(
          '/ng/api/servicesV2',
          {
            params: {
              accountIdentifier: this.client.defaults.headers['Harness-Account'],
              orgIdentifier,
              projectIdentifier,
              page: pageIndex,
              size: this.pageSize,
            },
          }
        );

        const data = response.data?.data;
        if (!data?.content || data.content.length === 0) {
          hasMore = false;
          break;
        }

        for (const service of data.content) {
          yield {
            ...service,
            orgIdentifier,
            projectIdentifier,
          };
        }

        hasMore = !data.last && data.content.length === this.pageSize;
        pageIndex++;
      } catch (err: any) {
        throw wrapApiError(
          err,
          `Failed to fetch services for project ${projectIdentifier}`
        );
      }
    }
  }

  async *getEnvironments(
    orgIdentifier: string,
    projectIdentifier: string
  ): AsyncGenerator<Environment> {
    let pageIndex = 0;
    let hasMore = true;

    while (hasMore) {
      try {
        const response = await this.client.get<PaginatedResponse<Environment>>(
          '/ng/api/environmentsV2',
          {
            params: {
              accountIdentifier: this.client.defaults.headers['Harness-Account'],
              orgIdentifier,
              projectIdentifier,
              page: pageIndex,
              size: this.pageSize,
            },
          }
        );

        const data = response.data?.data;
        if (!data?.content || data.content.length === 0) {
          hasMore = false;
          break;
        }

        for (const env of data.content) {
          yield {
            ...env,
            orgIdentifier,
            projectIdentifier,
          };
        }

        hasMore = !data.last && data.content.length === this.pageSize;
        pageIndex++;
      } catch (err: any) {
        throw wrapApiError(
          err,
          `Failed to fetch environments for project ${projectIdentifier}`
        );
      }
    }
  }

  async *getExecutions(
    orgIdentifier: string,
    projectIdentifier: string,
    since?: number
  ): AsyncGenerator<Execution> {
    let pageIndex = 0;
    let hasMore = true;
    const startTime = since ?? this.startDate.getTime();

    while (hasMore) {
      try {
        const response = await this.client.post<ExecutionListResponse>(
          '/pipeline/api/pipelines/execution/summary',
          {
            filterType: 'PipelineExecution',
          },
          {
            params: {
              accountIdentifier: this.client.defaults.headers['Harness-Account'],
              orgIdentifier,
              projectIdentifier,
              page: pageIndex,
              size: this.pageSize,
              startTime,
            },
          }
        );

        const data = response.data?.data;
        if (!data?.content || data.content.length === 0) {
          hasMore = false;
          break;
        }

        for (const execution of data.content) {
          yield {
            ...execution,
            orgIdentifier,
            projectIdentifier,
          };
        }

        hasMore = !data.empty && pageIndex < data.totalPages - 1;
        pageIndex++;
      } catch (err: any) {
        throw wrapApiError(
          err,
          `Failed to fetch executions for project ${projectIdentifier}`
        );
      }
    }
  }

  getStartDate(): Date {
    return this.startDate;
  }

  static reset(): void {
    HarnessNextgen.instance_ = null;
  }
}
