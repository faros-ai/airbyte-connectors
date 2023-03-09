import {Command} from 'commander';
import {
  AirbyteLogger,
  AirbyteSourceBase,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {Octopus, OctopusConfig} from './octopus';
import {Deployments, Releases} from './streams';

export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new OctopusSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

export class OctopusSource extends AirbyteSourceBase<OctopusConfig> {
  async spec(): Promise<AirbyteSpec> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  async checkConnection(config: OctopusConfig): Promise<[boolean, VError]> {
    const octopus = await Octopus.instance(config, this.logger);
    await octopus.checkConnection();
    return;
  }
  streams(config: OctopusConfig): AirbyteStreamBase[] {
    return [
      new Deployments(config, this.logger),
      new Releases(config, this.logger),
    ];
  }
}
