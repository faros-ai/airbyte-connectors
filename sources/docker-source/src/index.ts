import {Command} from 'commander';
import {
  AirbyteLogger,
  AirbyteSourceBase,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {Docker, DockerConfig} from './docker';
import {Tags} from './streams';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new DockerSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** Docker source implementation. */
export class DockerSource extends AirbyteSourceBase {
  async spec(): Promise<AirbyteSpec> {
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  async checkConnection(config: DockerConfig): Promise<[boolean, VError]> {
    try {
      if (!config.repositories) {
        throw new VError('Provide repositories');
      }
      for await (const repo of config.repositories) {
        const options: DockerConfig = {...config, projectName: repo};
        const docker = await Docker.instance(options, this.logger);
        await docker.checkConnection(options);
      }
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }
  streams(config: DockerConfig): AirbyteStreamBase[] {
    return [new Tags(config, this.logger)];
  }
}
