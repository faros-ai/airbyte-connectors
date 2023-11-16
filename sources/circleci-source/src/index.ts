import {Command} from 'commander';
import {
  AirbyteLogger,
  AirbyteSourceBase,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {CircleCI, CircleCIConfig} from './circleci/circleci';
import {Pipelines, Projects, Tests} from './streams';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new CircleCISource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** Customer.io source implementation. */
export class CircleCISource extends AirbyteSourceBase<CircleCIConfig> {
  async spec(): Promise<AirbyteSpec> {
    this.logger.info('Running spec');
    return new AirbyteSpec(require('../resources/spec.json'));
  }

  async checkConnection(config: CircleCIConfig): Promise<[boolean, VError]> {
    this.logger.info('Running check Connection');
    try {
      const circleCI = await CircleCI.instance(config, this.logger);
      await circleCI.checkConnection();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }

  streams(config: CircleCIConfig): AirbyteStreamBase[] {
    this.logger.info('Running streams');
    return [
      new Projects(config, this.logger),
      new Pipelines(config, this.logger),
      new Tests(config, this.logger),
    ];
  }
}
