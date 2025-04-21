import {ProjectReference} from 'azure-devops-node-api/interfaces/ReleaseInterfaces';
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
}

export abstract class ProjectsStreamBase extends AzurePipelinesStreamBase {
  async *streamSlices(): AsyncGenerator<ProjectReference> {
    const azurePipelines = await AzurePipelines.instance(
      this.config,
      this.logger
    );
    for (const project of await azurePipelines.getProjects(
      this.config.projects
    )) {
      yield {
        id: project.id,
        name: project.name,
      };
    }
  }
}
