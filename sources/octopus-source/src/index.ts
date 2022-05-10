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
import {Channels, Deployments, Projects, Releases} from './streams/index';

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
    const projects = new Projects(config, this.logger);
    const releases = new Releases(config, this.logger);
    const channels = new Channels(config, this.logger);
    const deployment = new Deployments(config, this.logger);
    return [releases, projects, channels, deployment];
  }
}
