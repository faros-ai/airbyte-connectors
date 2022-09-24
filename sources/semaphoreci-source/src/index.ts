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

import {SemaphoreCI, SemaphoreCIConfig} from './semaphoreci/semaphoreci';
import {Pipelines, Projects} from './streams';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new SemaphoreCISource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** SemaphoreCI source implementation. */
export class SemaphoreCISource extends AirbyteSourceBase<SemaphoreCIConfig> {
  async spec(): Promise<AirbyteSpec> {
    return new AirbyteSpec(
      fileJson(path.resolve(__dirname, '../resources/spec.json'))
    );
  }
  async checkConnection(config: SemaphoreCIConfig): Promise<[boolean, VError]> {
    try {
      const semaphoreci = SemaphoreCI.instance(config, this.logger);
      await semaphoreci.checkConnection();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }
  streams(config: SemaphoreCIConfig): AirbyteStreamBase[] {
    const projects = new Projects(config, this.logger);
    const pipelines = new Pipelines(config, this.logger, projects);

    return [projects, pipelines];
  }
}
