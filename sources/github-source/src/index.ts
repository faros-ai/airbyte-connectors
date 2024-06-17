import {Command} from 'commander';
import {
  AirbyteSourceBase,
  AirbyteSourceLogger,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {makeOctokitClient} from './octokit';
import {GithubConfig} from './types';

export function mainCommand(): Command {
  const logger = new AirbyteSourceLogger();
  const source = new GithubSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

export class GithubSource extends AirbyteSourceBase<GithubConfig> {
  get type(): string {
    return 'github';
  }

  async spec(): Promise<AirbyteSpec> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  async checkConnection(config: GithubConfig): Promise<[boolean, VError]> {
    try {
      const octokit = makeOctokitClient(config, this.logger);
      await octokit.users.getAuthenticated();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }
  streams(config: GithubConfig): AirbyteStreamBase[] {
    return [];
  }
}
