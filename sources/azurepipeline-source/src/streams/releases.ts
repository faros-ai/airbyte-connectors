import {
  ProjectReference,
  Release,
} from 'azure-devops-node-api/interfaces/ReleaseInterfaces';
import {calculateUpdatedStreamState, SyncMode} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {AzurePipelines} from '../azurepipeline';
import {ProjectsStreamBase} from './common';

interface ReleaseState {
  readonly [p: string]: {
    cutoff: number;
  };
}

export class Releases extends ProjectsStreamBase {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/releases.json');
  }

  get cursorField(): string | string[] {
    return 'createdOn';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: ProjectReference,
    streamState?: ReleaseState
  ): AsyncGenerator<Release> {
    const project = streamSlice;
    const state = streamState?.[project.name];
    const cutoff =
      syncMode === SyncMode.INCREMENTAL ? state?.cutoff : undefined;
    const azurePipelines = await AzurePipelines.instance(
      this.config,
      this.logger
    );
    yield* azurePipelines.getReleases(project, cutoff);
  }

  getUpdatedState(
    currentStreamState: ReleaseState,
    latestRecord: Release,
    slice: ProjectReference
  ): ReleaseState {
    const latestRecordCutoff = latestRecord.createdOn;
    return calculateUpdatedStreamState(
      latestRecordCutoff,
      currentStreamState,
      slice.name
    );
  }
}
