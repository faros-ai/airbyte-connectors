import {Command} from 'commander';
import {
  AirbyteLogger,
  AirbyteSourceBase,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {Bitbucket} from './bitbucket/bitbucket';
import {BitbucketConfig} from './bitbucket/types';
import {
  Branches,
  Commits,
  Deployments,
  Issues,
  Pipelines,
  PipelineSteps,
  PullRequestActivities,
  PullRequests,
  Repositories,
  Workspaces,
  WorkspaceUsers,
} from './streams';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new BitbucketSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

export class BitbucketSource extends AirbyteSourceBase {
  async spec(): Promise<AirbyteSpec> {
    return new AirbyteSpec(require('../resources/spec.json'));
  }

  async checkConnection(config: BitbucketConfig): Promise<[boolean, VError]> {
    try {
      const bitbucket = Bitbucket.instance(
        config as BitbucketConfig,
        this.logger
      );
      await bitbucket.checkConnection();
    } catch (error: any) {
      return [false, error];
    }
    return [true, undefined];
  }

  streams(config: BitbucketConfig): AirbyteStreamBase[] {
    const repositories = config.repositories;
    const prIDs = config.pull_request_id ?? [];
    const pipelines = new Pipelines(config, repositories, this.logger);
    const pullRequests = new PullRequests(config, repositories, this.logger);
    return [
      new Branches(config, repositories, this.logger),
      new Commits(config, repositories, this.logger),
      new Deployments(config, repositories, this.logger),
      new Issues(config, repositories, this.logger),
      pipelines,
      new PipelineSteps(config, repositories, pipelines, this.logger),
      new PullRequestActivities(
        config,
        repositories,
        prIDs,
        pullRequests,
        this.logger
      ),
      new PullRequests(config, repositories, this.logger),
      new Repositories(config, this.logger),
      new WorkspaceUsers(config, this.logger),
      new Workspaces(config, this.logger),
    ];
  }
}
