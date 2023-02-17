import axios, {AxiosError, AxiosInstance, AxiosResponse} from 'axios';
import https from 'https';
import {VError} from 'verror';

import {Job, Pipeline, Project, Workflow} from './typings';

const DEFAULT_API_URL = 'https://circleci.com/api/v2';

export interface CircleCIConfig {
  readonly token: string;
  readonly project_names: ReadonlyArray<string>;
  readonly reject_unauthorized: boolean;
  readonly cutoff_days: number;
  readonly url?: string;
}

export class CircleCI {
  constructor(readonly axios: AxiosInstance, readonly startDate: Date) {}

  static instance(
    config: CircleCIConfig,
    axiosInstance?: AxiosInstance
  ): CircleCI {
    if (!config.token) {
      throw new VError('No token provided');
    }
    if (!config.project_names || config.project_names.length == 0) {
      throw new VError('No project names provided');
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
      startDate
    );
  }

  async checkConnection(config: CircleCIConfig): Promise<void> {
    try {
      await this.axios.get(`/project/${config.project_names[0]}`);
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
    requester: (params: any | undefined) => Promise<AxiosResponse<any>>,
    deserializer: (item: any) => V,
    stopper?: (item: V) => boolean
  ): Promise<V[]> {
    const list = [];
    let pageToken = undefined;
    let getNextPage = true;
    do {
      const res = await requester({'page-token': pageToken});
      if (res.status === 404) {
        return list;
      }

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

  async *fetchProject(projectName: string): AsyncGenerator<Project> {
    const {data} = await this.axios.get(`/project/${projectName}`);
    yield data;
  }

  async *fetchPipelines(
    projectName: string,
    since?: string
  ): AsyncGenerator<Pipeline> {
    const startTime = new Date(since ?? 0);
    const startTimeMax =
      startTime > this.startDate ? startTime : this.startDate;
    const url = `/project/${projectName}/pipeline`;
    const pipelines = await this.iterate<Pipeline>(
      (params) => this.axios.get(url, {params}),
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

  async fetchWorkflows(pipelineId: string): Promise<Workflow[]> {
    const url = `/pipeline/${pipelineId}/workflow`;
    return this.iterate(
      (params) =>
        this.axios.get(url, {
          params: params,
          validateStatus: validateNotFoundStatus,
        }),
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
          validateStatus: validateNotFoundStatus,
        }),
      (item: any) => item
    );
  }
}

// CircleCi API returns 404 if no workflows or jobs exist for a given pipeline
function validateNotFoundStatus(status: number): boolean {
  return status === 200 || status === 404;
}
