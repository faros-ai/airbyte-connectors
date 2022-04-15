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
  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any>,
    streamState?: BuildState
  ): AsyncGenerator<Build> {
    const lastQueueTime =
      syncMode === SyncMode.INCREMENTAL
        ? streamState?.lastQueueTime
        : undefined;
    const azurePipeline = AzurePipeline.instance(this.config);
    yield* azurePipeline.getBuilds(lastQueueTime);
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
