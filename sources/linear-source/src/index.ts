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

import {Linear, LinearConfig} from './linear/linear';
import {Cycles, Projects, Users} from './streams';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new BuildkiteSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** Linear source implementation. */
export class BuildkiteSource extends AirbyteSourceBase {
  async spec(): Promise<AirbyteSpec> {
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  async checkConnection(config: AirbyteConfig): Promise<[boolean, VError]> {
    try {
      const linear = Linear.instance(config as LinearConfig, this.logger);
      await linear.checkConnection();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }
  streams(config: AirbyteConfig): AirbyteStreamBase[] {
    return [
      new Cycles(config as LinearConfig, this.logger),
      new Projects(config as LinearConfig, this.logger),
      new Users(config as LinearConfig, this.logger),
    ];
  }
}
