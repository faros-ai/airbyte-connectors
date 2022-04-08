import {Gitlab as GitlabClient} from '@gitbeaker/node';
import {AirbyteLogger} from 'faros-airbyte-cdk/lib';
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
    private readonly logger: AirbyteLogger
  ) {}

  static instance(config: GitlabConfig, logger: AirbyteLogger): Gitlab {
    if (!config.token) {
      throw new VError('token must not be an empty string');
    }
    if (!config.groupName) {
      throw new VError('group name must not be an empty string');
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

    logger.debug('Created Gitlab instance');

    return new Gitlab(client, logger);
  }

  private createError(error: any, errorMessage: string) {
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

  async *getGroup(groupNameOrId: string | number): AsyncGenerator<Group> {
    const options = {withProjects: false};
    try {
      let group = await this.client.Groups.show(groupNameOrId, options);
      // Handle sub-groups in project path Ex: group/subGroup/project
      // https://github.com/faros-ai/feeds/blob/2f7e2745981596b284b54e4d12d99dadba6c06ab/feeds/cicd/gitlabci-feed/src/index.ts#L200
      const groupPathArray = group.full_path.split('/');
      if (groupPathArray.length > 1) {
        group = await this.client.Groups.show(group.full_path, options);
      }
      yield buildGroup(group);
    } catch (error: any) {
      this.createError(error, `Error while fetching group ${groupNameOrId}.`);
    }
  }

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

  async *getPipelines(
    projectPath: string,
    config: GitlabConfig,
    lastUpdated?: string
  ): AsyncGenerator<Pipeline> {
    const options: RequestOptions = {
      perPage: config.pageSize || DEFAULT_PER_PAGE,
      updatedAfter: lastUpdated,
      orderBy: 'updated_at',
      showExpanded: true,
    };
    // If we have already synced this project, ignore maxPipelinesPerProject
    // and get everything since last sync to avoid gaps in data
    // https://github.com/faros-ai/feeds/blob/a08a35c6da0c60586095816d7a2e4f659d45b594/feeds/cicd/gitlabci-feed/src/gitlab.ts#L177
    const maxCount = lastUpdated ? undefined : config.maxPipelinesPerProject;
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

  async *getJobs(projectPath: string, pipelineId: number): AsyncGenerator<Job> {
    try {
      const jobs = await this.client.Jobs.showPipelineJobs(
        projectPath,
        pipelineId
      );
      for (const job of jobs) {
        yield buildJob(job);
      }
    } catch (error: any) {
      this.createError(error, 'Error while fetching jobs.');
    }
  }
}
