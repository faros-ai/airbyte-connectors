import {Command} from 'commander';
import {
  AirbyteLogger,
  AirbyteSourceBase,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {Buildkite, BuildkiteConfig} from './buildkite/buildkite';
import {Builds, Organizations, Pipelines} from './streams';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new BuildkiteSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** Buildkite source implementation. */
export class BuildkiteSource extends AirbyteSourceBase<BuildkiteConfig> {
  get type(): string {
    return 'buildkite';
  }

  async spec(): Promise<AirbyteSpec> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  async checkConnection(config: BuildkiteConfig): Promise<[boolean, VError]> {
    try {
      const buildkite = Buildkite.instance(config, this.logger);
      await buildkite.checkConnection();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }
  streams(config: BuildkiteConfig): AirbyteStreamBase[] {
    return [
      new Organizations(config, this.logger),
      new Pipelines(config, this.logger),
      new Builds(config, this.logger),
    ];
  }
}
