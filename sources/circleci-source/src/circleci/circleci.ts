import axios, {AxiosError, AxiosInstance} from 'axios';
import https from 'https';
import {VError} from 'verror';

import {Job, Pipeline, Project, Workflow} from './typings';

const DEFAULT_API_URL = 'https://circleci.com/api/v2';

export interface CircleCIConfig {
  readonly token: string;
  readonly repo_names: ReadonlyArray<string>;
  readonly reject_unauthorized: boolean;
  readonly cutoff_days: number;
  readonly url?: string;
}

export class CircleCI {
  constructor(
    readonly axios: AxiosInstance,
    readonly repoNames: ReadonlyArray<string>,
    readonly startDate: Date
  ) {}

  static instance(
    config: CircleCIConfig,
    axiosInstance?: AxiosInstance
  ): CircleCI {
    if (!config.token) {
      throw new VError('No token provided');
    }
    if (!config.repo_names || config.repo_names.length == 0) {
      throw new VError('No repository names provided');
    }
    if (!config.cutoff_days) {
      throw new VError('cutoff_days is null or empty');
    }
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - config.cutoff_days);

    const rejectUnauthorized = config.reject_unauthorized ?? true;
    const url = config.url ?? DEFAULT_API_URL;
    return new CircleCI(
      axiosInstance ??
        axios.create({
          baseURL: url,
          headers: {
            accept: 'application/json',
            'Circle-Token': config.token,
          },
          httpsAgent: new https.Agent({rejectUnauthorized}),
        }),
      config.repo_names,
      startDate
    );
  }

  async checkConnection(): Promise<void> {
    try {
      await this.axios.get(`/project/${this.repoNames[0]}`);
    } catch (error) {
      if (
        (error as AxiosError).response &&
        (error as AxiosError).response.status === 401
      ) {
        throw new VError(
          'CircleCI authorization failed. Try changing your app api token'
        );
      }

      throw new VError(
        `CircleCI API request failed: ${(error as Error).message}`
      );
    }
  }

  private async iterate<V>(
    requester: (params: any | undefined) => Promise<any>,
    deserializer: (item: any) => any,
    stopper?: (item: any) => boolean
  ): Promise<V[]> {
    const list = [];
    let pageToken = undefined;
    let getNextPage = true;
    do {
      const res: any = await requester({'page-token': pageToken});

      const items = Array.isArray(res) ? res : res.data.items;
      for (const item of items ?? []) {
        const data = deserializer(item);
        if (stopper && stopper(data)) {
          getNextPage = false;
          break;
        }
        list.push(data);
      }
      pageToken = res.data.next_page_token;
    } while (getNextPage && pageToken);
    return list;
  }

  async *fetchProject(repoName: string): AsyncGenerator<Project> {
    const {data} = await this.axios.get(`/project/${repoName}`);
    yield data;
  }

  async *fetchPipelines(
    repoName: string,
    since?: string
  ): AsyncGenerator<Pipeline> {
    const startTime = new Date(since ?? 0);
    const startTimeMax =
      startTime > this.startDate ? startTime : this.startDate;
    const url = `/project/${repoName}/pipeline`;
    const pipelines = await this.iterate<Pipeline>(
      (params) => this.axios.get(url, {params: params}),
      (item: any) => ({
        ...item,
        workflows: [],
      }),
      (item: Pipeline) =>
        item.updated_at && startTimeMax >= new Date(item.updated_at)
    );
    for (const pipeline of pipelines) {
      pipeline.workflows = await this.fetchWorkflows(pipeline.id);
      for (const workflow of pipeline.workflows) {
        workflow.jobs = await this.fetchJobs(workflow.id);
      }
      yield pipeline;
    }
  }

  fetchWorkflows(pipelineId: string): Promise<Workflow[]> {
    const url = `/pipeline/${pipelineId}/workflow`;
    return this.iterate(
      (params) => this.axios.get(url, {params: params}),
      (item: any) => ({
        ...item,
        jobs: [],
      })
    );
  }

  async fetchJobs(workflowId: string): Promise<Job[]> {
    return this.iterate(
      (params) =>
        this.axios.get(`/workflow/${workflowId}/job`, {
          params: params,
        }),
      (item: any) => item
    );
  }
}
