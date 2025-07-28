import {ProjectReference} from 'azure-devops-node-api/interfaces/ReleaseInterfaces';
import {AirbyteLogger, AirbyteStreamBase, StreamKey} from 'faros-airbyte-cdk';

import {AzureWorkitems} from '../azure-workitems';
import {AzureWorkitemsConfig} from '../types';
export abstract class StreamBase extends AirbyteStreamBase {
  constructor(
    protected readonly config: AzureWorkitemsConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  get primaryKey(): StreamKey {
    return 'id';
  }
}

export abstract class StreamWithProjectSlices extends StreamBase {
  async *streamSlices(): AsyncGenerator<ProjectReference> {
    const azureWorkitems = await AzureWorkitems.instance(
      this.config,
      this.logger,
      this.config.additional_fields,
      this.config.fetch_work_item_comments
    );
    const projects = await azureWorkitems.getProjects(this.config.projects);
    for (const project of projects) {
      yield {name: project.name, id: project.id};
    }
  }
}
