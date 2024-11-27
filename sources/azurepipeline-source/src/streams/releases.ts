import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Release} from 'faros-airbyte-common/azurepipeline';
import {Dictionary} from 'ts-essentials';

import {AzurePipeline, AzurePipelineConfig} from '../azurepipeline';

interface ReleaseState {
  lastCreatedOn: string;
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
    const lastCreatedOn =
      syncMode === SyncMode.INCREMENTAL
        ? streamState?.lastCreatedOn
        : undefined;
    const azurePipeline = await AzurePipeline.instance(
      this.config,
      this.logger
    );
    yield* azurePipeline.getReleases(
      streamSlice.project,
      lastCreatedOn,
      this.logger
    );
  }

  getUpdatedState(
    currentStreamState: ReleaseState,
    latestRecord: Release
  ): ReleaseState {
    const lastCreatedOn: Date = new Date(latestRecord.createdOn);
    return {
      lastCreatedOn:
        lastCreatedOn >= new Date(currentStreamState?.lastCreatedOn || 0)
          ? latestRecord.createdOn
          : currentStreamState.lastCreatedOn,
    };
  }
}
