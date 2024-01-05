import {SyncMode} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Pipeline} from '../circleci/types';
import {CircleCIStreamBase} from './common';

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

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: any,
    streamState?: PipelineState
  ): AsyncGenerator<Pipeline, any, unknown> {
    for (const projectSlug of this.cfg.project_slugs) {
      const since =
        syncMode === SyncMode.INCREMENTAL
          ? streamState?.[projectSlug]?.lastUpdatedAt
          : undefined;

      yield* this.circleCI.fetchPipelines(projectSlug, since);
    }
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
