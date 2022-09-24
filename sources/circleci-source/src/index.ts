import {AxiosInstance} from 'axios';
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

import {CircleCI, CircleCIConfig} from './circleci/circleci';
import {Pipelines, Projects} from './streams';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new CircleCISource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** Customer.io source implementation. */
export class CircleCISource extends AirbyteSourceBase<CircleCIConfig> {
  constructor(logger: AirbyteLogger, private readonly axios?: AxiosInstance) {
    super(logger);
  }

  async spec(): Promise<AirbyteSpec> {
    return new AirbyteSpec(
      fileJson(path.resolve(__dirname, '../resources/spec.json'))
    );
  }

  async checkConnection(config: CircleCIConfig): Promise<[boolean, VError]> {
    try {
      const circleCI = CircleCI.instance(config, this.axios);
      await circleCI.checkConnection();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }

  streams(config: CircleCIConfig): AirbyteStreamBase[] {
    return [
      new Projects(this.logger, config, this.axios),
      new Pipelines(this.logger, config, this.axios),
    ];
  }
}
