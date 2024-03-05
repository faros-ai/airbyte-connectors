import {Command} from 'commander';
import {
  AirbyteLogger,
  AirbyteSourceBase,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {BitbucketServer, BitbucketServerConfig} from './bitbucket-server';
import {Commits} from './streams/commits';
import {ProjectUsers} from './streams/project_users';
import {Projects} from './streams/projects';
import {PullRequestActivities} from './streams/pull_request_activities';
import {PullRequestDiffs} from './streams/pull_request_diffs';
import {PullRequests} from './streams/pull_requests';
import {Repositories} from './streams/repositories';
import {Tags} from './streams/tags';
import {Users} from './streams/users';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new BitbucketServerSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

export class BitbucketServerSource extends AirbyteSourceBase<BitbucketServerConfig> {
  get type(): string {
    return 'bitbucket-server';
  }

  async spec(): Promise<AirbyteSpec> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return new AirbyteSpec(require('../resources/spec.json'));
  }

  async checkConnection(
    config: BitbucketServerConfig
  ): Promise<[boolean, VError]> {
    try {
      const bitbucket = BitbucketServer.instance(config, this.logger);
      await bitbucket.checkConnection();
    } catch (error: any) {
      return [false, error];
    }
    return [true, undefined];
  }

  streams(config: BitbucketServerConfig): AirbyteStreamBase[] {
    return [
      Commits,
      ProjectUsers,
      Projects,
      PullRequestActivities,
      PullRequestDiffs,
      PullRequests,
      Repositories,
      Tags,
      Users,
    ].map((Stream) => new Stream(config, this.logger));
  }
}
