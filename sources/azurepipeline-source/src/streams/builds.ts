import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Build} from 'faros-airbyte-common/azurepipeline';
import {Dictionary} from 'ts-essentials';

import {AzurePipeline, AzurePipelineConfig} from '../azurepipeline';

interface BuildState {
  lastFinishTime: string;
}

type StreamSlice = {
  project: string;
};

export class Builds extends AirbyteStreamBase {
  constructor(
    private readonly config: AzurePipelineConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/builds.json');
  }
  get primaryKey(): StreamKey {
    return 'id';
  }
  get cursorField(): string | string[] {
    return 'finishTime';
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
    streamState?: BuildState
  ): AsyncGenerator<Build> {
    const lastFinishTime =
      syncMode === SyncMode.INCREMENTAL
        ? streamState?.lastFinishTime
        : undefined;
    const azurePipeline = await AzurePipeline.instance(
      this.config,
      this.logger
    );
    yield* azurePipeline.getBuilds(
      streamSlice.project,
      lastFinishTime,
      this.logger
    );
  }
  getUpdatedState(
    currentStreamState: BuildState,
    latestRecord: Build
  ): BuildState {
    const lastFinishTime: Date = new Date(latestRecord.finishTime);
    return {
      lastFinishTime:
        lastFinishTime >= new Date(currentStreamState?.lastFinishTime || 0)
          ? latestRecord.finishTime
          : currentStreamState.lastFinishTime,
    };
  }
}
