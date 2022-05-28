import {AxiosInstance} from 'axios';
import {AirbyteLogger, AirbyteStreamBase, SyncMode} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {CircleCI, CircleCIConfig} from '../circleci/circleci';
import {Pipeline} from '../circleci/typings';

type StreamSlice = {
  orgSlug: string;
  repoName: string;
};

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
    return 'updated_at';
  }

  async *streamSlices(): AsyncGenerator<StreamSlice> {
    for (const orgSlug of this.config.org_slugs) {
      for (const repoName of this.config.repo_names) {
        yield {
          orgSlug,
          repoName,
        };
      }
    }
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: StreamSlice,
    streamState?: PipelineState
  ): AsyncGenerator<Pipeline, any, unknown> {
    const lastUpdatedAt =
      syncMode === SyncMode.INCREMENTAL
        ? streamState?.lastUpdatedAt
        : undefined;
    const circleCI = CircleCI.instance(this.config, this.axios);
    yield* circleCI.fetchPipelines(
      streamSlice.orgSlug,
      streamSlice.repoName,
      lastUpdatedAt
    );
  }
  getUpdatedState(
    currentStreamState: PipelineState,
    latestRecord: Pipeline
  ): PipelineState {
    const lastUpdatedAt: Date = new Date(latestRecord.updated_at);
    return {
      lastUpdatedAt:
        lastUpdatedAt >= new Date(currentStreamState?.lastUpdatedAt || 0)
          ? latestRecord.updated_at
          : currentStreamState.lastUpdatedAt,
    };
  }
}
