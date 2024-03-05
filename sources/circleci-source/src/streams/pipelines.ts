import {SyncMode} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Pipeline} from '../circleci/types';
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
    for (const projectSlug of this.cfg.project_slugs) {
      yield {projectSlug};
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
        ? streamState?.[streamSlice.projectSlug]?.lastUpdatedAt
        : undefined;
    yield* this.circleCI.fetchPipelines(streamSlice.projectSlug, since);
  }

  getUpdatedState(
    currentStreamState: PipelineState,
    latestRecord: Pipeline
  ): PipelineState {
    const projectSlug = latestRecord.project_slug;
    const projectState = currentStreamState[projectSlug] ?? {};

    const newProjectState = {
      lastUpdatedAt:
        new Date(latestRecord.computedProperties.updatedAt) >
        new Date(projectState.lastUpdatedAt ?? 0)
          ? latestRecord.computedProperties.updatedAt
          : projectState.lastUpdatedAt,
    };
    return {...currentStreamState, [projectSlug]: newProjectState};
  }
}
