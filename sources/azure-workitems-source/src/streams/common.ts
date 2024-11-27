import {AirbyteLogger, AirbyteStreamBase, StreamKey} from 'faros-airbyte-cdk';

import {AzureWorkitems, AzureWorkitemsConfig} from '../azure-workitems';

export type ProjectStreamSlice = {
  name: string;
  id: string;
};

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
  async *streamSlices(): AsyncGenerator<ProjectStreamSlice> {
    const azureWorkitems = await AzureWorkitems.instance(
      this.config,
      this.logger
    );
    const projects = await azureWorkitems.getProjects(this.config.projects);
    for (const project of projects) {
      yield {name: project.name, id: project.id};
    }
  }
}
