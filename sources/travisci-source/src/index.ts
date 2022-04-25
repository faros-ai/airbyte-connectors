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

import {Builds, Owners, Repositories} from './streams';
import {TravisCI, TravisCIConfig} from './travisci/travisci';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new TravisCISource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** Customer.io source implementation. */
export class TravisCISource extends AirbyteSourceBase {
  constructor(logger: AirbyteLogger, private readonly axios?: AxiosInstance) {
    super(logger);
  }

  async spec(): Promise<AirbyteSpec> {
    return new AirbyteSpec(require('../resources/spec.json'));
  }

  async checkConnection(config: AirbyteConfig): Promise<[boolean, VError]> {
    try {
      const customerIO = TravisCI.instance(
        config as TravisCIConfig,
        this.axios
      );
      await customerIO.checkConnection();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }

  streams(config: AirbyteConfig): AirbyteStreamBase[] {
    return [
      new Builds(this.logger, config as TravisCIConfig, this.axios),
      new Repositories(this.logger, config as TravisCIConfig, this.axios),
      new Owners(this.logger, config as TravisCIConfig, this.axios),
    ];
  }
}
