import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {AzurePipeline, AzurePipelineConfig} from '../azurepipeline';
import {Build} from '../models';

interface BuildState {
  lastQueueTime: string;
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
    return 'queueTime';
  }
  async *streamSlices(): AsyncGenerator<StreamSlice> {
    for (const project of this.config.projects) {
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
    const lastQueueTime =
      syncMode === SyncMode.INCREMENTAL
        ? streamState?.lastQueueTime
        : undefined;
    const azurePipeline = AzurePipeline.instance(this.config, this.logger);
    yield* azurePipeline.getBuilds(
      streamSlice.project,
      lastQueueTime,
      this.logger
    );
  }
  getUpdatedState(
    currentStreamState: BuildState,
    latestRecord: Build
  ): BuildState {
    const lastQueueTime: Date = new Date(latestRecord.queueTime);
    return {
      lastQueueTime:
        lastQueueTime >= new Date(currentStreamState?.lastQueueTime || 0)
          ? latestRecord.queueTime
          : currentStreamState.lastQueueTime,
    };
  }
}
