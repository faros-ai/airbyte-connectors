import {AxiosInstance} from 'axios';
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

import {CircleCI, CircleCIConfig} from './circleci/circleci';
import {Pipelines, Projects} from './streams';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new CircleCISource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** Customer.io source implementation. */
export class CircleCISource extends AirbyteSourceBase {
  constructor(logger: AirbyteLogger, private readonly axios?: AxiosInstance) {
    super(logger);
  }

  async spec(): Promise<AirbyteSpec> {
    return new AirbyteSpec(require('../resources/spec.json'));
  }

  async checkConnection(config: AirbyteConfig): Promise<[boolean, VError]> {
    try {
      const circleCI = CircleCI.instance(config as CircleCIConfig, this.axios);
      await circleCI.checkConnection();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }

  streams(config: AirbyteConfig): AirbyteStreamBase[] {
    return [
      new Projects(this.logger, config as CircleCIConfig, this.axios),
      new Pipelines(this.logger, config as CircleCIConfig, this.axios),
    ];
  }
}
