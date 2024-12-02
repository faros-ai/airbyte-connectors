import {
  AirbyteLogger,
  AirbyteStreamBase,
  calculateUpdatedStreamState,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Release} from 'faros-airbyte-common/azurepipeline';
import {Utils} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';

import {AzurePipeline, AzurePipelineConfig} from '../azurepipeline';

interface ReleaseState {
  readonly [p: string]: {
    cutoff: number;
  };
}

type StreamSlice = {
  project: string;
};

export class Releases extends AirbyteStreamBase {
  constructor(
    private readonly config: AzurePipelineConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/releases.json');
  }

  get primaryKey(): StreamKey {
    return 'id';
  }

  get cursorField(): string | string[] {
    return 'createdOn';
  }

  async *streamSlices(): AsyncGenerator<StreamSlice> {
    const azurePipeline = await AzurePipeline.instance(
      this.config,
      this.logger
    );
    for (const project of azurePipeline.getInitializedProjects()) {
      yield {
        project,
      };
    }
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: StreamSlice,
    streamState?: ReleaseState
  ): AsyncGenerator<Release> {
    const project = streamSlice?.project;
    const state = streamState?.[project];
    const cutoff =
      syncMode === SyncMode.INCREMENTAL ? state?.cutoff : undefined;
    const azurePipeline = await AzurePipeline.instance(
      this.config,
      this.logger
    );
    yield* azurePipeline.getReleases(project, cutoff, this.logger);
  }

  getUpdatedState(
    currentStreamState: ReleaseState,
    latestRecord: Release,
    slice: StreamSlice
  ): ReleaseState {
    const latestRecordCutoff = Utils.toDate(latestRecord.createdOn);
    return calculateUpdatedStreamState(
      latestRecordCutoff,
      currentStreamState,
      slice.project
    );
  }
}
