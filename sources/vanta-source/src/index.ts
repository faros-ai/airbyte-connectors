import {Command} from 'commander';
import {
  AirbyteConfig,
  AirbyteSourceBase,
  AirbyteSourceLogger,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {Vulnerabilities} from './streams';
import {VulnerabilityRemediations} from './streams/vulnerability_remediations';
import {Vanta} from './vanta';

export interface VantaConfig extends AirbyteConfig {
  readonly client_id: string;
  readonly client_secret: string;
  readonly page_size?: number;
  readonly cutoff_days?: number;
  readonly api_max_retries?: number;
  readonly api_timeout?: number;
}

/** The main entry point. */
export function mainCommand(): Command {
  const sourceLogger = new AirbyteSourceLogger();
  const source = new VantaSource(sourceLogger);
  return new AirbyteSourceRunner(sourceLogger, source).mainCommand();
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
    const vanta = await Vanta.instance(config, this.logger);
    try {
      const res = await vanta.checkConnection();
      return res;
    } catch (error) {
      return [false, new VError(error, 'Connection check failed')];
    }
  }

  streams(config: VantaConfig): AirbyteStreamBase[] {
    return [
      new Vulnerabilities(config, this.logger),
      new VulnerabilityRemediations(config, this.logger),
    ];
  }
}
