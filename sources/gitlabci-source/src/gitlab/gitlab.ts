import {Gitlab as GitlabClient} from '@gitbeaker/node';
import {AirbyteLogger} from 'faros-airbyte-cdk/lib';
import {VError} from 'verror';

import {buildGroup, buildJob, buildPipeline, buildProject} from './builders';
import {GitlabConfig, Group, Job, Pipeline, Project} from './types';

export class Gitlab {
  constructor(
    private readonly client: any,
    private readonly logger: AirbyteLogger
  ) {}

  static instance(config: GitlabConfig, logger: AirbyteLogger): Gitlab {
    if (!config.token) {
      throw new VError('token must be not an empty string');
    }
    if (!config.groupName) {
      throw new VError('group name must be not an empty string');
    }

    const client = new GitlabClient({token: config.token});

    logger.debug('Created Gitlab instance');

    return new Gitlab(client, logger);
  }

  async checkConnection(): Promise<void> {
    try {
      const projects = await this.client.Projects.show(
        'matussmutny1/best-project'
      );
      console.log(projects);
    } catch (error: any) {
      const err = error?.message ?? JSON.stringify(error);
      throw new VError(`Please verify your token is correct. Error: ${err}`);
    }
  }

  async *getGroup(groupNameOrId: string | number): AsyncGenerator<Group> {
    const options = {withProjects: false};
    try {
      let group = await this.client.Groups.show(groupNameOrId, options);
      const groupPathArray = group.full_path.split('/');
      if (groupPathArray.length > 1) {
        group = await this.client.Groups.show(group.full_path, options);
      }
      yield buildGroup(group);
    } catch (error: any) {
      const err = error?.message ?? JSON.stringify(error);
      throw new VError(
        `Error while fetching group ${groupNameOrId}. Error: ${err}`
      );
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
      const err = error?.message ?? JSON.stringify(error);
      throw new VError(`Error while fetching projects. Error: ${err}`);
    }
  }

  async *getPipelines(projectPath: string): AsyncGenerator<Pipeline> {
    try {
      const pipelines = await this.client.Pipelines.all(projectPath);
      for (const pipeline of pipelines) {
        yield buildPipeline(pipeline);
      }
    } catch (error: any) {
      const err = error?.message ?? JSON.stringify(error);
      throw new VError(`Error while fetching pipelines. Error: ${err}`);
    }
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
      const err = error?.message ?? JSON.stringify(error);
      throw new VError(`Error while fetching jobs. Error: ${err}`);
    }
  }
}
