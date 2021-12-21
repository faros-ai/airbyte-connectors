import {Command} from 'commander';
import {
  AirbyteConfig,
  AirbyteLogger,
  AirbyteSourceBase,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {Buildkite, BuildkiteConfig} from './buildkite/buildkite';
import {Builds, Jobs, Organizations, Pipelines} from './streams';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new StatuspageSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** StatusPage source implementation. */
export class StatuspageSource extends AirbyteSourceBase {
  async spec(): Promise<AirbyteSpec> {
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  async checkConnection(config: AirbyteConfig): Promise<[boolean, VError]> {
    try {
      const statuspage = Buildkite.instance(
        config as BuildkiteConfig,
        this.logger
      );
      await statuspage.checkConnection();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }
  streams(config: AirbyteConfig): AirbyteStreamBase[] {
    return [
      new Organizations(config as BuildkiteConfig, this.logger),
      new Pipelines(config as BuildkiteConfig, this.logger),
      new Builds(config as BuildkiteConfig, this.logger),
      new Jobs(config as BuildkiteConfig, this.logger),
    ];
  }
}
