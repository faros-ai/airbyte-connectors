import {AxiosInstance} from 'axios';
import {AirbyteLogger, AirbyteStreamBase, SyncMode} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {CircleCI, CircleCIConfig} from '../circleci/circleci';
import {Pipeline} from '../circleci/typings';

type StreamSlice = {
  projectName: string;
};

type PipelineState = Dictionary<{lastUpdatedAt?: string}>;

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
    for (const projectName of this.config.project_names) {
      yield {projectName};
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
        ? streamState?.[streamSlice.projectName]?.lastUpdatedAt
        : undefined;
    const circleCI = CircleCI.instance(this.config, this.axios);
    yield* circleCI.fetchPipelines(streamSlice.projectName, lastUpdatedAt);
  }
  getUpdatedState(
    currentStreamState: PipelineState,
    latestRecord: Pipeline
  ): PipelineState {
    const projectName = latestRecord.project_slug;
    const projectState = currentStreamState[projectName] ?? {};

    const newProjectState = {
      lastUpdatedAt:
        new Date(latestRecord.updated_at) >
        new Date(projectState.lastUpdatedAt ?? 0)
          ? latestRecord.updated_at
          : projectState.lastUpdatedAt,
    };
    return {...currentStreamState, [projectName]: newProjectState};
  }
}
