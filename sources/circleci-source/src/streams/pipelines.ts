import {SyncMode} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Pipeline} from '../circleci/typings';
import {StreamBase} from './common';

type StreamSlice = {
  projectName: string;
};

type PipelineState = Dictionary<{lastUpdatedAt?: string}>;

export class Pipelines extends StreamBase {
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
    for (const projectName of this.cfg.project_names) {
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
    yield* this.circleCI.fetchPipelines(streamSlice.projectName, lastUpdatedAt);
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
