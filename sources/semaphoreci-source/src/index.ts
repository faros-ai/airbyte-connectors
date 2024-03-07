import {Command} from 'commander';
import {
  AirbyteSourceBase,
  AirbyteSourceLogger,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {SemaphoreCI, SemaphoreCIConfig} from './semaphoreci/semaphoreci';
import {Pipelines, Projects} from './streams';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteSourceLogger();
  const source = new SemaphoreCISource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** SemaphoreCI source implementation. */
export class SemaphoreCISource extends AirbyteSourceBase<SemaphoreCIConfig> {
  get type(): string {
    return 'semaphoreci';
  }

  async spec(): Promise<AirbyteSpec> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return new AirbyteSpec(require('../resources/spec.json'));
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
