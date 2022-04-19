import {AxiosInstance} from 'axios';
import {AirbyteLogger, AirbyteStreamBase, SyncMode} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {CircleCI, CircleCIConfig} from '../circle-ci/circle-ci';
import {Pipeline} from '../circle-ci/typings';

interface PipelineState {
  lastUpdatedAt: string;
}
export class Pipelines extends AirbyteStreamBase {
  constructor(
    logger: AirbyteLogger,
    private readonly config: CircleCIConfig,
    private readonly axios?: AxiosInstance
  ) {
    super(logger);
  }
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/pipelines.json');
  }

  get primaryKey(): string {
    return 'id';
  }

  get cursorField(): string {
    return 'updatedAt';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any, string>,
    streamState?: PipelineState
  ): AsyncGenerator<Pipeline, any, unknown> {
    const lastUpdatedAt =
      syncMode === SyncMode.INCREMENTAL
        ? streamState?.lastUpdatedAt
        : undefined;
    const circleCI = CircleCI.instance(this.config, this.axios);
    yield* circleCI.fetchPipelines(lastUpdatedAt);
  }
  getUpdatedState(
    currentStreamState: PipelineState,
    latestRecord: Pipeline
  ): PipelineState {
    const lastUpdatedAt: Date = new Date(latestRecord.updatedAt);
    return {
      lastUpdatedAt:
        lastUpdatedAt >= new Date(currentStreamState?.lastUpdatedAt || 0)
          ? latestRecord.updatedAt
          : currentStreamState.lastUpdatedAt,
    };
  }
}
