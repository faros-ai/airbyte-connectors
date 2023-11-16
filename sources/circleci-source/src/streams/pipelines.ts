import {SyncMode} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {CircleCI} from '../circleci/circleci';
import {Pipeline} from '../circleci/typings';
import {CircleCIStreamBase, StreamSlice} from './common';

type PipelineState = Dictionary<{lastUpdatedAt?: string}>;

export class Pipelines extends CircleCIStreamBase {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/pipelines.json');
  }

  get primaryKey(): string {
    return 'id';
  }

  get cursorField(): string[] {
    return ['computedProperties', 'updatedAt'];
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
    const since =
      syncMode === SyncMode.INCREMENTAL
        ? streamState?.[streamSlice.projectName]?.lastUpdatedAt
        : undefined;
    const circleCI = await CircleCI.instance(this.cfg, this.logger);
    yield* circleCI.fetchPipelines(streamSlice.projectName, since);
  }

  getUpdatedState(
    currentStreamState: PipelineState,
    latestRecord: Pipeline
  ): PipelineState {
    const projectName = latestRecord.project_slug;
    const projectState = currentStreamState[projectName] ?? {};

    const newProjectState = {
      lastUpdatedAt:
        new Date(latestRecord.computedProperties.updatedAt) >
        new Date(projectState.lastUpdatedAt ?? 0)
          ? latestRecord.computedProperties.updatedAt
          : projectState.lastUpdatedAt,
    };
    return {...currentStreamState, [projectName]: newProjectState};
  }
}
