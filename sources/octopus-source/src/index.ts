import {
  Client,
  ClientConfiguration,
  Repository,
} from '@octopusdeploy/api-client';
import {ProjectResource} from '@octopusdeploy/message-contracts';
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
import {Projects} from './streams/projects';
import {Releases} from './streams/releases';
/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new OctopusSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** AzureActiveDirectory source implementation. */
export class OctopusSource extends AirbyteSourceBase {
  async spec(): Promise<AirbyteSpec> {
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  async checkConnection(config: OctopusConfig): Promise<[boolean, VError]> {
    try {
      const octopus = await Octopus.instance(config, this.logger);
      await octopus.checkConnection();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }
  streams(config: OctopusConfig): AirbyteStreamBase[] {
    return [
      new Projects(config, this.logger),
      new Releases(config, this.logger),
    ];
  }
}
