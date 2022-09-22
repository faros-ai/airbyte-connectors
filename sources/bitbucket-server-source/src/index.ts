import {Command} from 'commander';
import {
  AirbyteLogger,
  AirbyteSourceBase,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {BitbucketServer} from './bitbucket-server/bitbucket-server';
import {BitbucketServerConfig} from './bitbucket-server/types';
import {Commits} from './streams/commits';
import {ProjectUsers} from './streams/project_users';
import {Projects} from './streams/projects';
import {PullRequests} from './streams/pull_requests';
import {Repositories} from './streams/repositories';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new BitbucketServerSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

export class BitbucketServerSource extends AirbyteSourceBase<BitbucketServerConfig> {
  async spec(): Promise<AirbyteSpec> {
    /* eslint-disable-next-line @typescript-eslint/no-var-requires */
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
    return [Commits, ProjectUsers, Projects, PullRequests, Repositories].map(
      (Stream) => new Stream(config, this.logger)
    );
  }
}
