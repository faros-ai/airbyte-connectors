import {ProjectReference} from 'azure-devops-node-api/interfaces/ReleaseInterfaces';
import {calculateUpdatedStreamState, SyncMode} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {AzurePipelines} from '../azurepipeline';
import {AzurePipelinesStreamBase} from './common';
interface BuildState {
  readonly [p: string]: {
    cutoff: number;
  };
}

export class Builds extends AzurePipelinesStreamBase {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/builds.json');
  }

  get cursorField(): string | string[] {
    return 'finishTime';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: ProjectReference,
    streamState?: BuildState
  ): AsyncGenerator<any> {
    const project = streamSlice;
    const state = streamState?.[project.name];
    const cutoff =
      syncMode === SyncMode.INCREMENTAL ? state?.cutoff : undefined;
    const azurePipelines = await AzurePipelines.instance(
      this.config,
      this.logger
    );
    yield* azurePipelines.getBuilds(project, cutoff);
  }

  getUpdatedState(
    currentStreamState: BuildState,
    latestRecord: any,
    slice: ProjectReference
  ): BuildState {
    return calculateUpdatedStreamState(
      latestRecord.finishTime,
      currentStreamState,
      slice.name
    );
  }
}
