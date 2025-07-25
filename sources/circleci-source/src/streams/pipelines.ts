import {SyncMode} from 'faros-airbyte-cdk';
import {Pipeline} from 'faros-airbyte-common/circleci';
import {Dictionary} from 'ts-essentials';

import {CircleCI} from '../circleci/circleci';
import {ProjectSlice, StreamWithProjectSlices} from './common';

type PipelineState = Dictionary<{lastUpdatedAt?: string}>;

export class Pipelines extends StreamWithProjectSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/pipelines.json');
  }

  get primaryKey(): string {
    return 'id';
  }

  get cursorField(): string[] {
    return ['computedProperties', 'updatedAt'];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: ProjectSlice,
    streamState?: PipelineState
  ): AsyncGenerator<Pipeline, any, unknown> {
    const circleCI = CircleCI.instance(this.cfg, this.logger);

    const since =
      syncMode === SyncMode.INCREMENTAL
        ? streamState?.[streamSlice.projectSlug]?.lastUpdatedAt
        : undefined;

    yield* circleCI.fetchPipelines(streamSlice.projectSlug, since);
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
