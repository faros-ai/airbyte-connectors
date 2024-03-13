import {Command} from 'commander';
import {
  AirbyteSourceBase,
  AirbyteSourceLogger,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {
  Agileaccelerator,
  AgileacceleratorConfig,
} from './agileaccelerator/agileaccelerator';
import {Works} from './streams';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteSourceLogger();
  const source = new AgileacceleratorSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** AgileAccelerator source implementation. */
export class AgileacceleratorSource extends AirbyteSourceBase<AgileacceleratorConfig> {
  get type(): string {
    return 'agileaccelerator';
  }

  async spec(): Promise<AirbyteSpec> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  async checkConnection(
    config: AgileacceleratorConfig
  ): Promise<[boolean, VError]> {
    try {
      const agileaccelerator = await Agileaccelerator.instance(
        config,
        this.logger
      );
      await agileaccelerator.checkConnection(config);
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }
  streams(config: AgileacceleratorConfig): AirbyteStreamBase[] {
    return [new Works(config, this.logger)];
  }
}
