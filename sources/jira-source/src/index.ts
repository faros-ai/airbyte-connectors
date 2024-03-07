import {Command} from 'commander';
import {
  AirbyteLogger,
  AirbyteSourceBase,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {Jira, JiraConfig} from './jira';
import {PullRequests} from './streams/pull_requests';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new JiraSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** Example source implementation. */
export class JiraSource extends AirbyteSourceBase<JiraConfig> {
  async spec(): Promise<AirbyteSpec> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  async checkConnection(config: JiraConfig): Promise<[boolean, VError]> {
    try {
      await Jira.instance(config, this.logger);
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }
  streams(config: JiraConfig): AirbyteStreamBase[] {
    return [new PullRequests(config, this.logger)];
  }
}
