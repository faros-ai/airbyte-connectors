import {TeamProject} from 'azure-devops-node-api/interfaces/CoreInterfaces';
import {AirbyteLogger, AirbyteStreamBase, StreamKey} from 'faros-airbyte-cdk';

import {AzureDevOps} from './azure-devops';
import {AzureDevOpsConfig} from './types';

export type ProjectStreamSlice = {
  name: string;
  id: string;
};

export abstract class AzureDevOpsStreamBase extends AirbyteStreamBase {
  constructor(
    protected readonly config: AzureDevOpsConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  get primaryKey(): StreamKey {
    return 'id';
  }
}

export abstract class StreamWithProjectSlices extends AzureDevOpsStreamBase {
  async *streamSlices(): AsyncGenerator<TeamProject> {
    const azureDevOps = await AzureDevOps.instance(this.config, this.logger);
    const projects = await azureDevOps.getProjects(this.config.projects);
    yield* projects;
  }
}
