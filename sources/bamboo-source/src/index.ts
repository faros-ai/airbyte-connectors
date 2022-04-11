import {Command} from 'commander';
import {
  AirbyteLogger,
  AirbyteSourceBase,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {Bamboo, BambooConfig} from './bamboo';
import {Builds, Deployments, Plans} from './streams';
/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new BambooSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}
/** Bamboo source implementation. */
export class BambooSource extends AirbyteSourceBase {
  async spec(): Promise<AirbyteSpec> {
    return new AirbyteSpec(require('../resources/spec.json'));
  }

  async checkConnection(config: BambooConfig): Promise<[boolean, VError]> {
    try {
      const bamboo = await Bamboo.instance(config, this.logger);
      await bamboo.checkConnection();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }

  streams(config: BambooConfig): AirbyteStreamBase[] {
    return [
      new Builds(config, this.logger, config.projectNames),
      new Deployments(config, this.logger),
      new Plans(config, this.logger, config.projectNames),
    ];
  }
}
