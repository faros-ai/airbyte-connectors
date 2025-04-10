import {ProjectReference} from 'azure-devops-node-api/interfaces/ReleaseInterfaces';
import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Run} from 'faros-airbyte-common/azure-devops';
import {Dictionary} from 'ts-essentials';

import {AzurePipelines} from '../azurepipeline';
import {AzurePipelineConfig} from '../types';

interface PipelineStreamSlice {
  project: ProjectReference;
  pipeline: {
    id: number;
    name: string;
  };
}

interface RunState {
  readonly [p: string]: {
    cutoff: number;
  };
}

// TODO: Use shared one
export class Runs extends AirbyteStreamBase {
  constructor(
    protected readonly config: AzurePipelineConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  // TODO: Create full schema
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/runs.json');
  }

  get primaryKey(): StreamKey {
    return 'id';
  }

  get cursorField(): string | string[] {
    return 'finishedDate';
  }

  override async *streamSlices(): AsyncGenerator<PipelineStreamSlice> {
    const azurePipelines = await AzurePipelines.instance(
      this.config,
      this.logger
    );
    for (const project of await azurePipelines.getProjects(
      this.config.projects
    )) {
      for (const pipeline of await azurePipelines.getPipelines(project)) {
        yield {
          pipeline: {
            id: pipeline.id,
            name: pipeline.name,
          },
          project: {
            id: project.id,
            name: project.name,
          },
        };
      }
    }
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: PipelineStreamSlice
  ): AsyncGenerator<Run> {
    const azurePipelines = await AzurePipelines.instance(
      this.config,
      this.logger
    );

    const {project, pipeline} = streamSlice;
    yield* azurePipelines.getRuns(project, pipeline.id);
  }
}
