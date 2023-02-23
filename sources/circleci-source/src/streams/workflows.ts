import {SyncMode} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Workflow} from '../circleci/typings';
import {StreamBase} from './common';

type StreamSlice = {
  pipelineId: string;
};

type StreamState = {[pipelineId: string]: {lastStoppedAt: string}};

export class Workflows extends StreamBase {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/workflows.json');
  }

  get primaryKey(): string {
    return 'id';
  }

  get cursorField(): string | string[] {
    return ['stopped_at'];
  }

  async *streamSlices(): AsyncGenerator<StreamSlice> {
    for (const projectName of this.cfg.project_names) {
      for (const pipeline of await this.circleCI.fetchPipelines(projectName)) {
        yield {pipelineId: pipeline.id};
      }
    }
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: StreamSlice,
    streamState?: StreamState
  ): AsyncGenerator<Workflow, any, unknown> {
    const pipelineId = streamSlice.pipelineId;
    const lastStoppedAt =
      syncMode === SyncMode.INCREMENTAL
        ? streamState?.[pipelineId]?.lastStoppedAt
        : undefined;
    for (const workflow of await this.circleCI.fetchWorkflows(
      streamSlice.pipelineId,
      lastStoppedAt
    )) {
      yield workflow;
    }
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: Workflow
  ): StreamState {
    const pipelineId = latestRecord.pipeline_id;
    const lastStoppedAt = currentStreamState[pipelineId]?.lastStoppedAt;
    if (
      latestRecord.stopped_at &&
      new Date(latestRecord.stopped_at) > new Date(lastStoppedAt ?? 0)
    ) {
      return {
        ...currentStreamState,
        [pipelineId]: {lastStoppedAt: latestRecord.stopped_at},
      };
    }
    return currentStreamState;
  }
}
