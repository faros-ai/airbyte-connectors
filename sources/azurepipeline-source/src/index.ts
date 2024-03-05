import {Command} from 'commander';
import {
  AirbyteLogger,
  AirbyteSourceBase,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {AzurePipeline, AzurePipelineConfig} from './azurepipeline';
import {Builds, Pipelines, Releases} from './streams';
/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
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
      const azurePipeline = AzurePipeline.instance(config);
      await azurePipeline.checkConnection();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }
  streams(config: AzurePipelineConfig): AirbyteStreamBase[] {
    return [
      new Pipelines(config, this.logger),
      new Builds(config, this.logger),
      new Releases(config, this.logger),
    ];
  }
}
