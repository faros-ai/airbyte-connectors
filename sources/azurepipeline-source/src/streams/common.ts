import {TeamProject} from 'azure-devops-node-api/interfaces/CoreInterfaces';
import {AirbyteLogger, AirbyteStreamBase, StreamKey} from 'faros-airbyte-cdk';

import {AzurePipelines} from '../azurepipeline';
import {AzurePipelineConfig} from '../types';

export abstract class AzurePipelinesStreamBase extends AirbyteStreamBase {
  constructor(
    protected readonly config: AzurePipelineConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  get primaryKey(): StreamKey {
    return 'id';
  }

  async *streamSlices(): AsyncGenerator<TeamProject> {
    const azurePipelines = await AzurePipelines.instance(
      this.config,
      this.logger
    );
    yield* await azurePipelines.getProjects(this.config.projects);
  }
}
