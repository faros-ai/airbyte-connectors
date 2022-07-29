import axios, {
  AxiosError,
  AxiosInstance,
  AxiosResponse,
  AxiosResponseHeaders,
} from 'axios';
import {AirbyteLogger} from 'faros-airbyte-cdk';
import parse, {Links} from 'parse-link-header';
import {Memoize} from 'typescript-memoize';
import {VError} from 'verror';

const REST_API_VERSION = 'v1alpha';
const SEMAPHORE_PAGE_HEADER = 'link';
const HTTP_CLIENT_DEFAULT_TIMEOUT = 15000;

export const UNAUTHORIZED_ERROR_MESSAGE =
  'SemaphoreCI API authorization failed. Verify that your API Token and Organization name are setup correctly';
export const MISSING_OR_INVISIBLE_RESOURCE_ERROR_MESSAGE =
  'Resource not found or is not visible to the user';

export interface ProjectSpec {
  readonly visibility: string;
  readonly name: string;
  readonly owner: string;
}

export interface ProjectMeta {
  readonly owner_id: string;
  readonly org_id: string;
  readonly name: string;
  readonly id: string;
  readonly description: string;
}

export interface Project {
  readonly spec: ProjectSpec;
  readonly metadata: ProjectMeta;
}

export interface PipelineTime {
  readonly seconds: number;
  readonly nanos: number;
}

export interface Pipeline {
  readonly terminate_request: string;
  readonly queuing_at: PipelineTime;
  readonly working_directory: string;
  readonly name: string;
  readonly branch_id: string;
  readonly project_id: string;
  readonly running_at: string;
  readonly partially_rerun_by: string;
  readonly with_after_task: string;
  readonly state: string;
  readonly snapshot_id: string;
  readonly commit_message: string;
  readonly commit_sha: string;
  readonly terminated_by: string;
  readonly after_task_id: string;
  readonly created_at: PipelineTime;
  readonly error_description: string;
  readonly repository_id: string;
  readonly yaml_file_name: string;
  readonly pending_at: PipelineTime;
  readonly ppl_id: string;
  readonly stopping_at: PipelineTime;
  readonly wf_id: string;
  readonly done_at: PipelineTime;
  readonly result: string;
  readonly compile_task_id: string;
  readonly hook_id: string;
  readonly branch_name: string;
  readonly promotion_of: string;
  readonly switch_id: string;
  readonly result_reason: string;
  readonly partial_rerun_of: string;
}

export interface SemaphoreCIConfig {
  readonly organization: string;
  readonly token: string;
  readonly projects?: string;
  readonly branches?: string;
  readonly timeout?: number;
  readonly delay?: number;
}

export class SemaphoreCI {
  private static semaphoreci: SemaphoreCI = null;

  constructor(
    private readonly restClient: AxiosInstance,
    private readonly projectIds: Array<string>,
    public readonly branchNames: Array<string>,
    private readonly delay: number,
    private readonly logger: AirbyteLogger
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

    const projectIds = (config.projects && config.projects?.split(',')) || [];
    const branchNames = (config.branches && config.branches?.split(',')) || [];
    const delay = config.delay || 0;

    const auth = `Token ${config.token}`;

    const httpClient = axios.create({
      baseURL: `https://${config.organization}.semaphoreci.com/api/${REST_API_VERSION}`,
      timeout: config.timeout * 1000 || HTTP_CLIENT_DEFAULT_TIMEOUT,
      headers: {authorization: auth},
    });

    SemaphoreCI.semaphoreci = new SemaphoreCI(
      httpClient,
      projectIds,
      branchNames,
      delay,
      logger
    );
    logger.debug('Created SemaphoreCI instance');
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

  private extractLinkHeaders(headers: AxiosResponseHeaders): Links {
    const linkHeader = headers[SEMAPHORE_PAGE_HEADER];

    return parse(linkHeader);
  }

  private async paginate<V>(
    requester: (params: any | undefined) => Promise<AxiosResponse>,
    delay: number
  ): Promise<V[]> {
    const list = [];
    let nextPage = '1';

    do {
      const res = await requester({nextPage});

      const items = res.data;

      list.push(...items);

      nextPage = this.extractLinkHeaders(res.headers).next?.page;
      if (delay !== 0) {
        await new Promise((r) => setTimeout(r, delay));
      }
    } while (nextPage);

    return list;
  }

  @Memoize()
  async getProjects(): Promise<ReadonlyArray<Project>> {
    const res = await this.restClient.get<Project[]>('projects');
    const projects = res.data.filter((project) => {
      if (
        this.projectIds.length &&
        !this.projectIds.includes(project.metadata.id)
      ) {
        return false;
      }
      return true;
    });

    return projects;
  }

  async *getPipelines(projectId, branchName): AsyncGenerator<Pipeline> {
    const pipelines = await this.paginate<Pipeline>(
      ({nextPage}) =>
        this.restClient.get(
          `pipelines?page=${nextPage}&project_id=${projectId}${
            branchName ? '&branch_name=' + branchName : ''
          }`
        ),
      this.delay
    );

    for (const pipeline of pipelines) {
      yield pipeline;
    }
  }
}
