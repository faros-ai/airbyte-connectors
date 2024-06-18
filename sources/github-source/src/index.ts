import {Command} from 'commander';
import {
  AirbyteSourceBase,
  AirbyteSourceLogger,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {GitHub} from './github';
import {FarosCopilotSeats} from './streams/faros_copilot_seats';
import {GitHubConfig} from './types';

export function mainCommand(): Command {
  const logger = new AirbyteSourceLogger();
  const source = new GitHubSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

export class GitHubSource extends AirbyteSourceBase<GitHubConfig> {
  get type(): string {
    return 'github';
  }

  async spec(): Promise<AirbyteSpec> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return new AirbyteSpec(require('../resources/spec.json'));
  }

  async checkConnection(config: GitHubConfig): Promise<[boolean, VError]> {
    try {
      const github = await GitHub.instance(config, this.logger);
      await github.checkConnection();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }

  streams(config: GitHubConfig): AirbyteStreamBase[] {
    return [new FarosCopilotSeats(config, this.logger)];
  }
}
