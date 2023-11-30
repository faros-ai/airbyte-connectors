import axios, {
  AxiosError,
  AxiosInstance,
  AxiosResponse,
  AxiosResponseHeaders,
  RawAxiosResponseHeaders,
} from 'axios';
import axiosRetry, {IAxiosRetryConfig} from 'axios-retry';
import {AirbyteLogger} from 'faros-airbyte-cdk';
import parse, {Links} from 'parse-link-header';
import {Memoize} from 'typescript-memoize';
import {VError} from 'verror';

import {Job, Pipeline, PipelineDetailed, Project} from './models';

const REST_API_VERSION = 'v1alpha';
const SEMAPHORE_PAGE_HEADER = 'link';
const HTTP_CLIENT_DEFAULT_TIMEOUT = 15000;

export const UNAUTHORIZED_ERROR_MESSAGE =
  'SemaphoreCI API authorization failed. Verify that your API Token and Organization name are setup correctly';
export const MISSING_OR_INVISIBLE_RESOURCE_ERROR_MESSAGE =
  'Resource not found or is not visible to the user';

export interface SemaphoreCIConfig {
  readonly organization: string;
  readonly token: string;
  readonly projects: string[];
  readonly startDate: string;
  readonly branches: string[];
  readonly timeout?: number;
  readonly delay?: number;
  readonly includeJobs?: boolean;
}

export class SemaphoreCI {
  private static semaphoreci: SemaphoreCI = null;

  constructor(
    private readonly restClient: AxiosInstance,
    private readonly projectIds: ReadonlyArray<string>,
    private readonly startDate: Date,
    private readonly delay: number,
    private readonly includeJobs: boolean,
    private readonly logger: AirbyteLogger,

    public readonly branchNames: ReadonlyArray<string>
  ) {}

  static instance(
    config: SemaphoreCIConfig,
    logger: AirbyteLogger
  ): SemaphoreCI {
    if (SemaphoreCI.semaphoreci) return SemaphoreCI.semaphoreci;

    if (!config.token) {
      throw new VError('api token has to be provided and be non-empty');
    }
    if (!config.organization) {
      throw new VError('organization has to be provided and be non-empty');
    }

    const delay = config.delay || 0;

    const startDate = new Date(config.startDate);
    if (isNaN(startDate as unknown as number)) {
      throw new VError('start date is invalid');
    }

    const auth = `Token ${config.token}`;

    const retryConfig: IAxiosRetryConfig = {
      retryDelay: axiosRetry.exponentialDelay,
      shouldResetTimeout: true,
      retries: 5,
      onRetry(retryCount, error, requestConfig) {
        logger.info(
          `Retrying request ${requestConfig.url} due to ${error.message}`
        );
        logger.info(`${retryCount} attempt`);
      },
    };

    const httpClient = axios.create({
      baseURL: `https://${config.organization}.semaphoreci.com/api/${REST_API_VERSION}`,
      timeout: config.timeout * 1000 || HTTP_CLIENT_DEFAULT_TIMEOUT,
      headers: {authorization: auth},
    });

    axiosRetry(httpClient, retryConfig);

    SemaphoreCI.semaphoreci = new SemaphoreCI(
      httpClient,
      config.projects,
      startDate,
      delay,
      config.includeJobs,
      logger,
      config.branches
    );
    return SemaphoreCI.semaphoreci;
  }

  async checkConnection(): Promise<void> {
    try {
      await this.restClient.get(`projects`);
    } catch (error) {
      if ((error as AxiosError).response) {
        switch ((error as AxiosError).response.status) {
          case 401:
            throw new VError(UNAUTHORIZED_ERROR_MESSAGE);
          case 404:
            throw new VError(MISSING_OR_INVISIBLE_RESOURCE_ERROR_MESSAGE);
        }
      }

      throw new VError(
        `SemaphoreCI API request failed: ${(error as Error).message}`
      );
    }
  }

  private extractLinkHeaders(
    headers: RawAxiosResponseHeaders | AxiosResponseHeaders
  ): Links {
    const linkHeader = headers[SEMAPHORE_PAGE_HEADER];

    return parse(linkHeader);
  }

  private async paginate<V>(
    requester: (params: any | undefined) => Promise<AxiosResponse>,
    delay: number,
    deserializer: (item: any) => any,
    stopper?: (items: any) => boolean
  ): Promise<V[]> {
    const list = [];
    let nextPage = '1';
    let getNextPage = true;

    do {
      const res = await requester({nextPage});

      const items = res.data;
      for (const item of items ?? []) {
        const data = deserializer(item);
        if (stopper && stopper(data)) {
          getNextPage = false;
          break;
        }
        list.push(data);
      }

      nextPage = this.extractLinkHeaders(res.headers).next?.page;
      if (delay !== 0) {
        await new Promise((r) => setTimeout(r, delay));
      }
    } while (getNextPage && nextPage);

    return list;
  }

  @Memoize()
  async getProjects(): Promise<ReadonlyArray<Project>> {
    const res = await this.restClient.get<Project[]>('projects');
    const projects = res.data.filter((project) => {
      if (
        this.projectIds?.length &&
        !this.projectIds?.includes(project.metadata.id)
      ) {
        return false;
      }
      return true;
    });

    return projects;
  }

  private isValidDate(d: Date): boolean {
    return d instanceof Date && !isNaN(d as unknown as number);
  }

  private parsePipelineDate(pipeline: Pipeline, field: string): string {
    const formattedDate =
      pipeline[field].seconds * 1000 + pipeline[field].nanos / 100000;

    const date = new Date(formattedDate);
    return this.isValidDate(date)
      ? date.toISOString()
      : new Date(0).toISOString();
  }

  private convertPipelineDates(pipeline: Pipeline): Pipeline {
    const dateFields = [
      'queuing_at',
      'running_at',
      'created_at',
      'pending_at',
      'stopping_at',
      'done_at',
    ];

    dateFields.forEach((field: string) => {
      pipeline[field] = this.parsePipelineDate(pipeline, field);
    });

    return pipeline;
  }

  private convertJobDates(job: Job): Job {
    const dateFields = [
      'create_time',
      'update_time',
      'start_time',
      'finish_time',
    ];

    dateFields.forEach((field: string) => {
      const time = job.metadata[field];

      const date = new Date(time * 1000);
      job.metadata[field] = this.isValidDate(date)
        ? date.toISOString()
        : new Date(0).toISOString();
    });

    return job;
  }

  private async getPipelineJobsList(
    pipeline: Pipeline
  ): Promise<Array<string>> {
    const res = await this.restClient.get<PipelineDetailed>(
      `pipelines/${pipeline.ppl_id}?detailed=true`
    );
    const jobIds = [];

    res.data.blocks?.forEach((block) =>
      jobIds.push(...block.jobs.map((job) => job.job_id))
    );

    return jobIds;
  }

  private async getJobsDetail(jobIds: string[]): Promise<Array<Job>> {
    const jobs = [];

    for (const jobId of jobIds) {
      const res = await this.restClient.get<Job>(`jobs/${jobId}`);

      jobs.push(this.convertJobDates(res.data));
    }

    return jobs;
  }

  async *getPipelines(
    projectId: string,
    branchName: string,
    since?: string
  ): AsyncGenerator<Pipeline> {
    const projects = await this.getProjects();
    const startTime = new Date(since ?? 0);
    const startTimeMax =
      startTime > this.startDate ? startTime : this.startDate;

    const pipelines = await this.paginate<Pipeline>(
      ({nextPage}) =>
        this.restClient.get(
          `pipelines?page=${nextPage}&project_id=${projectId}${
            branchName ? '&branch_name=' + branchName : ''
          }`
        ),
      this.delay,
      (item: any) => this.convertPipelineDates(item),
      (pipeline: Pipeline) => startTimeMax > new Date(pipeline.created_at)
    );

    for (const pipeline of pipelines) {
      const project = projects.find(
        (p) => p.metadata.id === pipeline.project_id
      );
      let pipelineJobs = [];

      if (this.includeJobs) {
        this.logger.debug(`Fetching jobs for pipeline ${pipeline.ppl_id}`);

        const pipelineJobsList = await this.getPipelineJobsList(pipeline);
        pipelineJobs = await this.getJobsDetail(pipelineJobsList);
      }

      pipeline.jobs = pipelineJobs;
      pipeline.project = project;

      yield pipeline;
    }
  }
}
