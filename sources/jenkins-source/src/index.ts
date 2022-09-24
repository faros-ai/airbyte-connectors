import {Command} from 'commander';
import {
  AirbyteLogger,
  AirbyteSourceBase,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
  fileJson,
} from 'faros-airbyte-cdk';
import path from 'path';
import VError from 'verror';

import {Jenkins, JenkinsConfig} from './jenkins';
import {Builds, Jobs} from './streams';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new JenkinsSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** Jenkins source implementation. */
export class JenkinsSource extends AirbyteSourceBase<JenkinsConfig> {
  async spec(): Promise<AirbyteSpec> {
    return new AirbyteSpec(
      fileJson(path.resolve(__dirname, '../resources/spec.json'))
    );
  }
  async checkConnection(
    config: JenkinsConfig
  ): Promise<[boolean, VError | undefined]> {
    try {
      const jenkins = Jenkins.instance(config, this.logger);
      await jenkins.checkConnection();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }
  streams(config: JenkinsConfig): AirbyteStreamBase[] {
    return [new Builds(config, this.logger), new Jobs(config, this.logger)];
  }
}
