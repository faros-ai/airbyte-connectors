import {Command} from 'commander';
import {
  AirbyteLogger,
  AirbyteSourceBase,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {Jenkins, JenkinsBuilds, JenkinsConfig, JenkinsJobs} from './stream';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new JenkinsSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** Jenkins source implementation. */
export class JenkinsSource extends AirbyteSourceBase {
  async spec(): Promise<AirbyteSpec> {
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  async checkConnection(config: JenkinsConfig): Promise<[boolean, VError | undefined]> {
    const [client, errorMessage] = await Jenkins.validateClient(config);

    if (client) {
      return [true, undefined];
    }
    return [false, new VError(errorMessage)];
  }
  streams(config: JenkinsConfig): AirbyteStreamBase[] {
    return [
      new JenkinsBuilds(config, this.logger),
      new JenkinsJobs(config, this.logger),
    ];
  }
}
