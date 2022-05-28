import axios, {AxiosError, AxiosInstance} from 'axios';
import https from 'https';
import {VError} from 'verror';

import {Job, Pipeline, Project, Workflow} from './typings';

const DEFAULT_API_URL = 'https://circleci.com/api/v2';

export interface CircleCIConfig {
  readonly token: string;
  readonly org_slug: string;
  readonly repo_name: string;
  readonly rejectUnauthorized: boolean;
  readonly cutoff_days: number;
  readonly url?: string;
}

export class CircleCI {
  constructor(
    readonly axios: AxiosInstance,
    readonly orgSlug: string,
    readonly repoName: string,
    readonly startDate: Date
  ) {}

  static instance(
    config: CircleCIConfig,
    axiosInstance?: AxiosInstance
  ): CircleCI {
    if (!config.token) {
      throw new VError('No token provided');
    }
    if (!config.org_slug) {
      throw new VError('No org_slug provided');
    }
    const parts = config.org_slug.split('/').filter((p) => p);
    if (parts.length != 2) {
      throw new VError(
        `Organization slug %s does not match the expected format {vcs_slug}/{org_name}, e.g gh/my-org`,
        config.org_slug
      );
    }
    if (!config.repo_name) {
      throw new VError('No repo_name provided');
    }
    if (!config.cutoff_days) {
      throw new VError('cutoff_days is null or empty');
    }
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - config.cutoff_days);

    const rejectUnauthorized = config.rejectUnauthorized ?? true;
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
      config.org_slug,
      config.repo_name,
      startDate
    );
  }

  projectSlug(): string {
    return encodeURIComponent(`${this.orgSlug}/${this.repoName}`);
  }

  async checkConnection(): Promise<void> {
    try {
      await this.axios.get(`/project/${this.projectSlug()}`);
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
        `CircleCI api request failed: ${(error as Error).message}`
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

  async *fetchProject(): AsyncGenerator<Project> {
    const slug = this.projectSlug();
    const {data} = await this.axios.get(`/project/${slug}`);
    yield data;
  }

  async *fetchPipelines(since?: string): AsyncGenerator<Pipeline> {
    const startTime = new Date(since ?? 0);
    const startTimeMax =
      startTime > this.startDate ? startTime : this.startDate;
    const slug = this.projectSlug();
    const url = `/project/${slug}/pipeline`;
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
