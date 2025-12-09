import {AxiosInstance} from 'axios';
import {AirbyteLogger, wrapApiError} from 'faros-airbyte-cdk';
import {makeAxiosInstanceWithRetry} from 'faros-js-client';
import {Memoize} from 'typescript-memoize';
import VError from 'verror';

import {
  ExecutionOutlineResponse,
  HarnessConfig,
  Organization,
  OrganizationListResponse,
  Pipeline,
  PipelineExecution,
  PipelineListResponse,
  Project,
  ProjectListResponse,
} from './harness_models';

export const DEFAULT_CUTOFF_DAYS = 90;
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_HARNESS_API_URL = 'https://app.harness.io';
const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_RETRIES = 3;

export class Harness {
  private static harness: Harness = null;
  private readonly startDate: Date;

  constructor(
    private readonly api: AxiosInstance,
    private readonly config: HarnessConfig,
    private readonly logger: AirbyteLogger
  ) {
    this.startDate = new Date();
    this.startDate.setDate(this.startDate.getDate() - config.cutoff_days);
  }

  static instance(config: HarnessConfig, logger: AirbyteLogger): Harness {
    if (Harness.harness) return Harness.harness;

    if (!config.account_id) {
      throw new VError('Missing account_id');
    }
    if (!config.api_key) {
      throw new VError('Missing api_key');
    }

    const apiUrl = config.api_url || DEFAULT_HARNESS_API_URL;
    const api = makeAxiosInstanceWithRetry(
      {
        baseURL: `${apiUrl}/gateway`,
        timeout: DEFAULT_TIMEOUT_MS,
        headers: {
          'x-api-key': config.api_key,
          'Content-Type': 'application/json',
          'Harness-Account': config.account_id,
        },
      },
      logger.asPino(),
      DEFAULT_RETRIES,
      10000
    );

    Harness.harness = new Harness(api, config, logger);
    return Harness.harness;
  }

  async checkConnection(): Promise<void> {
    try {
      await this.api.get<OrganizationListResponse>('/ng/api/organizations', {
        params: {
          accountIdentifier: this.config.account_id,
          pageSize: 1,
        },
      });
    } catch (err: any) {
      throw wrapApiError(err, 'Failed to connect to Harness');
    }
  }

  private get pageSize(): number {
    return this.config.page_size || DEFAULT_PAGE_SIZE;
  }

  @Memoize()
  async getOrganizations(): Promise<ReadonlyArray<Organization>> {
    const orgs: Organization[] = [];
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      try {
        const params: Record<string, any> = {
          accountIdentifier: this.config.account_id,
          pageIndex: page,
          pageSize: this.pageSize,
        };
        if (this.config.organizations?.length) {
          params.identifiers = this.config.organizations;
        }

        const response = await this.api.get<OrganizationListResponse>(
          '/ng/api/organizations',
          {
            params,
            paramsSerializer: {indexes: null}, // serialize arrays as repeated params
          }
        );

        const data = response.data.data;
        for (const item of data.content || []) {
          orgs.push(item.organization);
        }

        page++;
        hasMore = page < (data.totalPages ?? 0);
      } catch (err: any) {
        throw wrapApiError(err, 'Failed to fetch organizations');
      }
    }

    this.logger.debug(`Fetched ${orgs.length} organizations: ${orgs.map((o) => o.identifier).join(', ')}`);
    return orgs;
  }

  @Memoize((orgIdentifier: string) => orgIdentifier)
  async getProjects(orgIdentifier: string): Promise<ReadonlyArray<Project>> {
    const projects: Project[] = [];
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      try {
        const response = await this.api.get<ProjectListResponse>(
          '/ng/api/projects',
          {
            params: {
              accountIdentifier: this.config.account_id,
              orgIdentifier,
              pageIndex: page,
              pageSize: this.pageSize,
            },
          }
        );

        const data = response.data.data;
        for (const item of data.content || []) {
          projects.push(item.project);
        }

        page++;
        hasMore = page < (data.totalPages ?? 0);
      } catch (err: any) {
        throw wrapApiError(
          err,
          `Failed to fetch projects for org ${orgIdentifier}`
        );
      }
    }

    return projects;
  }

  @Memoize(
    (orgIdentifier: string, projectIdentifier: string) =>
      `${orgIdentifier}/${projectIdentifier}`
  )
  async getPipelines(
    orgIdentifier: string,
    projectIdentifier: string
  ): Promise<ReadonlyArray<Pipeline>> {
    const pipelines: Pipeline[] = [];
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      try {
        const response = await this.api.post<PipelineListResponse>(
          '/pipeline/api/pipelines/list',
          {filterType: 'PipelineSetup'},
          {
            params: {
              accountIdentifier: this.config.account_id,
              orgIdentifier,
              projectIdentifier,
              page,
              size: this.pageSize,
            },
          }
        );

        const data = response.data.data;
        for (const item of data.content || []) {
          pipelines.push(item);
        }

        page++;
        hasMore = page < (data.totalPages ?? 0);
      } catch (err: any) {
        throw wrapApiError(
          err,
          `Failed to fetch pipelines for ${orgIdentifier}/${projectIdentifier}`
        );
      }
    }

    return pipelines;
  }

  async *getExecutions(
    orgIdentifier: string,
    projectIdentifier: string,
    pipelineIdentifier: string,
    cutoff?: number
  ): AsyncGenerator<PipelineExecution> {
    const sinceTime = cutoff || this.startDate.getTime();
    let lastSeenExecutionId: string | undefined;
    let lastSeenStartTime: number | undefined;
    let hasMore = true;

    while (hasMore) {
      const params: Record<string, any> = {
        accountIdentifier: this.config.account_id,
        orgIdentifier,
        projectIdentifier,
        pipelineIdentifier,
        size: this.pageSize,
      };

      if (lastSeenExecutionId && lastSeenStartTime) {
        params.lastSeenExecutionId = lastSeenExecutionId;
        params.lastSeenStartTime = lastSeenStartTime;
      }

      const requestBody = {
        filterType: 'PipelineExecution',
        moduleProperties: {cd: {}},
        timeRange: {
          startTime: sinceTime,
          endTime: Date.now(),
        },
      };

      try {
        const response = await this.api.post<ExecutionOutlineResponse>(
          '/pipeline/api/pipelines/execution/summary',
          requestBody,
          {params}
        );

        const data = response.data.data;
        for (const execution of data.content || []) {
          yield execution;
        }

        lastSeenExecutionId = data.lastSeenExecutionId;
        lastSeenStartTime = data.lastSeenStartTime;
        hasMore = data.hasMore;
      } catch (err: any) {
        throw wrapApiError(
          err,
          `Failed to fetch executions for ${orgIdentifier}/${projectIdentifier}/${pipelineIdentifier}`
        );
      }
    }
  }
}
