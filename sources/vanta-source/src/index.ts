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

import {Vulns} from './streams';

export interface VantaConfig extends AirbyteConfig {
  readonly apiUrl: string;
  readonly queryTypes: string[];
  readonly token: string;
  readonly skipConnectionCheck?: boolean;
  readonly limit?: number;
  readonly timeout?: number;
}

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new VantaSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** Vanta source implementation. */
export class VantaSource extends AirbyteSourceBase<VantaConfig> {
  get type(): string {
    return 'vanta';
  }

  async spec(): Promise<AirbyteSpec> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  async checkConnection(config: VantaConfig): Promise<[boolean, VError]> {
    // TODO: Not implemented
    if (config.skipConnectionCheck) {
      return [true, undefined];
    }
    return [true, undefined];
  }

  streams(config: VantaConfig): AirbyteStreamBase[] {
    return [new Vulns(config, this.logger)];
  }
}
