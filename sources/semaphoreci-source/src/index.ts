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

import {SemaphoreCI, SemaphoreCIConfig} from './semaphoreci/semaphoreci';
import {Pipelines, Projects} from './streams';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new SemaphoreCISource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** SemaphoreCI source implementation. */
export class SemaphoreCISource extends AirbyteSourceBase {
  async spec(): Promise<AirbyteSpec> {
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  async checkConnection(config: AirbyteConfig): Promise<[boolean, VError]> {
    try {
      const semaphoreci = SemaphoreCI.instance(
        config as SemaphoreCIConfig,
        this.logger
      );
      await semaphoreci.checkConnection();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }
  streams(config: AirbyteConfig): AirbyteStreamBase[] {
    const projects = new Projects(config as SemaphoreCIConfig, this.logger);
    const pipelines = new Pipelines(
      config as SemaphoreCIConfig,
      this.logger,
      projects
    );

    return [projects, pipelines];
  }
}
