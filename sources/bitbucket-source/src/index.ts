import {Command} from 'commander';
import {
  AirbyteSourceBase,
  AirbyteSourceLogger,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {Bitbucket} from './bitbucket';
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
import {BitbucketConfig} from './types';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteSourceLogger();
  const source = new BitbucketSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

export class BitbucketSource extends AirbyteSourceBase<BitbucketConfig> {
  get type(): string {
    return 'bitbucket';
  }

  async spec(): Promise<AirbyteSpec> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
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
    const pipelines = new Pipelines(config, this.logger);
    const pullRequests = new PullRequests(config, this.logger);
    return [
      new Branches(config, this.logger),
      new Commits(config, this.logger),
      new Deployments(config, this.logger),
      new Issues(config, this.logger),
      pipelines,
      new PipelineSteps(config, pipelines, this.logger), // TODO: Refactor to avoid passing pipelines stream
      pullRequests,
      new PullRequestActivities(config, pullRequests, this.logger),
      new Repositories(config, this.logger),
      new WorkspaceUsers(config, this.logger),
      new Workspaces(config, this.logger),
    ];
  }
}
