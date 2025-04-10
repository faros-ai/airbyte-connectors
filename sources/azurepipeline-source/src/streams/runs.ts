import {ProjectReference} from 'azure-devops-node-api/interfaces/ReleaseInterfaces';
import {calculateUpdatedStreamState, SyncMode} from 'faros-airbyte-cdk';
import {Run} from 'faros-airbyte-common/azure-devops';
import {Dictionary} from 'ts-essentials';

import {AzurePipelines} from '../azurepipeline';
import {AzurePipelinesStreamBase} from './common';

interface PipelineSlice {
  project: ProjectReference;
  pipeline: {
    id: number;
    name: string;
  };
}

interface RunsState {
  [projectName: string]: {
    [pipelineName: string]: {
      cutoff: number;
    };
  };
}

export class Runs extends AzurePipelinesStreamBase {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/runs.json');
  }

  get cursorField(): string | string[] {
    return 'finishedDate';
  }

  override async *streamSlices(): AsyncGenerator<PipelineSlice> {
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
    streamSlice?: PipelineSlice,
    streamState?: RunsState
  ): AsyncGenerator<Run> {
    const azurePipelines = await AzurePipelines.instance(
      this.config,
      this.logger
    );

    const {project, pipeline} = streamSlice;
    const state = streamState?.[project.name]?.[pipeline.name]?.cutoff;
    yield* azurePipelines.getRuns(project, pipeline.id, state);
  }

  getUpdatedState(
    currentStreamState: RunsState,
    latestRecord: Run,
    slice: PipelineSlice
  ): RunsState {
    const projectName = slice.project.name;
    const pipelineState = currentStreamState[projectName];
    const updatedPipelineState = calculateUpdatedStreamState(
      latestRecord.finishedDate,
      pipelineState,
      slice.pipeline.name
    );
    return {
      ...currentStreamState,
      [projectName]: updatedPipelineState,
    };
  }
}
