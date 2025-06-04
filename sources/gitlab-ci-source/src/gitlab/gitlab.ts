import {Gitlab as GitlabClient} from '@gitbeaker/node';
import {Memoize} from 'typescript-memoize';
import {VError} from 'verror';

import {buildGroup, buildJob, buildPipeline, buildProject} from './builders';
import {
  GitlabConfig,
  Group,
  Job,
  Pipeline,
  Project,
  RequestOptions,
} from './types';

const DEFAULT_PER_PAGE = 100;

export class Gitlab {
  constructor(
    private readonly client: any,
    readonly config: GitlabConfig
  ) {}

  static instance(config: GitlabConfig): Gitlab {
    if (!config.token) {
      throw new VError('token must not be an empty string');
    }
    if (!config.groupName) {
      throw new VError('group name must not be an empty string');
    }
    if (!Array.isArray(config.projects) || config.projects.length === 0) {
      throw new VError('projects must be a non-empty array');
    }
    if (
      config.apiVersion &&
      config.apiVersion !== 3 &&
      config.apiVersion !== 4
    ) {
      throw new VError('API version must be 3 or 4');
    }

    const client = new GitlabClient({
      token: config.token,
      host: config.apiUrl,
      version: config.apiVersion as 3 | 4 | undefined,
    });

    return new Gitlab(client, config);
  }

  private createError(error: any, errorMessage: string): void {
    const err = error?.message ?? JSON.stringify(error);
    throw new VError(`${errorMessage} Error: ${err}`);
  }

  async checkConnection(): Promise<void> {
    try {
      await this.client.Version.show();
    } catch (error: any) {
      this.createError(error, 'Please verify your token is correct.');
    }
  }

  @Memoize(
    (groupPath: string, projects: string[]) => `${groupPath};${projects}`
  )
  async *getGroups(
    groupName: string,
    projects: string[]
  ): AsyncGenerator<Group> {
    const options = {withProjects: false};
    const subGroupPaths = new Set();
    try {
      const group = await this.client.Groups.show(groupName, options);
      const builtGroup = buildGroup(group);
      yield builtGroup;
      // Retrieve sub-groups
      for (const projectName of projects) {
        // Handle sub-groups in project path Ex: group/subGroup/project
        // https://github.com/faros-ai/feeds/blob/2f7e2745981596b284b54e4d12d99dadba6c06ab/feeds/cicd/gitlabci-feed/src/index.ts#L200
        const projectPathArray = projectName.split('/');
        if (projectPathArray.length > 1) {
          const subGroupPath = projectPathArray.slice(0, -1).join('/');
          if (!subGroupPaths.has(subGroupPath)) {
            subGroupPaths.add(subGroupPath);
            const subGroupPathWithNamespace = `${builtGroup.fullPath}/${subGroupPath}`;
            const subGroup = await this.client.Groups.show(
              subGroupPathWithNamespace,
              options
            );
            yield buildGroup(subGroup);
          }
        }
      }
    } catch (error: any) {
      this.createError(error, `Error while fetching groups.`);
    }
  }

  @Memoize(
    (groupPath: string, projects: string[]) => `${groupPath};${projects}`
  )
  async *getProjects(
    groupPath: string,
    projects: string[]
  ): AsyncGenerator<Project> {
    try {
      for (const projectName of projects) {
        const projectPath = `${groupPath}/${projectName}`;
        const project = await this.client.Projects.show(projectPath);
        yield buildProject(project);
      }
    } catch (error: any) {
      this.createError(error, 'Error while fetching projects.');
    }
  }

  @Memoize(
    (groupPath: string, lastUpdated?: string) => `${groupPath};${lastUpdated}`
  )
  async *getPipelines(
    projectPath: string,
    lastUpdated?: string
  ): AsyncGenerator<Pipeline> {
    const options: RequestOptions = {
      perPage: this.config.pageSize || DEFAULT_PER_PAGE,
      updatedAfter: lastUpdated,
      orderBy: 'updated_at',
      showExpanded: true,
    };
    // If we have already synced this project, ignore maxPipelinesPerProject
    // and get everything since last sync to avoid gaps in data
    // https://github.com/faros-ai/feeds/blob/a08a35c6da0c60586095816d7a2e4f659d45b594/feeds/cicd/gitlabci-feed/src/gitlab.ts#L177
    const maxCount = lastUpdated
      ? undefined
      : this.config.maxPipelinesPerProject;
    let page = 1;
    let count = 0;
    do {
      try {
        const {data: pipelines, paginationInfo} =
          await this.client.Pipelines.all(projectPath, {...options, page});
        for (const pipeline of pipelines || []) {
          if (maxCount && count >= maxCount) {
            return;
          }
          yield buildPipeline(pipeline);
          count++;
        }
        page = paginationInfo?.next;
      } catch (error: any) {
        this.createError(error, 'Error while fetching pipelines.');
      }
    } while (page);
  }

  @Memoize(
    (projectPath: string, pipelineId: number) => `${projectPath};${pipelineId}`
  )
  async *getJobs(projectPath: string, pipelineId: number): AsyncGenerator<Job> {
    let page = 1;
    do {
      try {
        const {data: jobs, paginationInfo} =
          await this.client.Jobs.showPipelineJobs(projectPath, pipelineId, {
            showExpanded: true,
            page,
          });
        for (const job of jobs || []) {
          yield buildJob(job);
        }
        page = paginationInfo?.next;
      } catch (error: any) {
        this.createError(error, 'Error while fetching jobs.');
      }
    } while (page);
  }
}
