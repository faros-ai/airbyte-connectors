import {Command} from 'commander';
import {
  AirbyteSourceBase,
  AirbyteSourceLogger,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {AzurePipelines} from './azurepipeline';
import {Pipelines, Releases, Runs} from './streams';
import {AzurePipelineConfig} from './types';
/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteSourceLogger();
  const source = new AzurePipelineSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** AzurePipeline source implementation. */
export class AzurePipelineSource extends AirbyteSourceBase<AzurePipelineConfig> {
  get type(): string {
    return 'azurepipeline';
  }

  async spec(): Promise<AirbyteSpec> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  async checkConnection(
    config: AzurePipelineConfig
  ): Promise<[boolean, VError]> {
    try {
      const azurePipelines = await AzurePipelines.instance(config, this.logger);
      await azurePipelines.checkConnection(config.projects);
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }
  streams(config: AzurePipelineConfig): AirbyteStreamBase[] {
    return [
      new Pipelines(config, this.logger),
      new Runs(config, this.logger),
      new Releases(config, this.logger),
    ];
  }
}
