import {Command} from 'commander';
import {
  AirbyteConfiguredCatalog,
  AirbyteSourceBase,
  AirbyteSourceLogger,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteState,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import {applyRoundRobinBucketing, validateBucketingConfig} from 'faros-airbyte-common/common';
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
      const azurePipelines = await AzurePipelines.instance(
        config,
        this.logger,
        config.bucket_id,
        config.bucket_total
      );
      await azurePipelines.checkConnection(config.projects);
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }

  async onBeforeRead(
    config: AzurePipelineConfig,
    catalog: AirbyteConfiguredCatalog,
    state?: AirbyteState
  ): Promise<{
    config: AzurePipelineConfig;
    catalog: AirbyteConfiguredCatalog;
    state?: AirbyteState;
  }> {
    validateBucketingConfig(config, this.logger.info.bind(this.logger));

    const {config: newConfig, state: newState} = applyRoundRobinBucketing(
      config,
      state,
      this.logger.info.bind(this.logger)
    );

    return {
      config: newConfig as AzurePipelineConfig,
      catalog,
      state: newState,
    };
  }

  streams(config: AzurePipelineConfig): AirbyteStreamBase[] {
    return [
      new Pipelines(config, this.logger),
      new Runs(config, this.logger),
      new Releases(config, this.logger),
    ];
  }
}
