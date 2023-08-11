import {SyncMode} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {TestMetadata} from '../circleci/typings';
import {CircleCIStreamBase, StreamSlice} from './common';

type TestsState = Dictionary<{lastUpdatedAt?: string}>;

export class Tests extends CircleCIStreamBase {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/tests.json');
  }

  get primaryKey(): string[] {
    return ['project_slug', 'job_number'];
  }

  get cursorField(): string[] {
    return ['job_stopped_at'];
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
    streamState?: TestsState
  ): AsyncGenerator<TestMetadata, any, unknown> {
    const since =
      syncMode === SyncMode.INCREMENTAL
        ? streamState?.[streamSlice.projectName]?.lastUpdatedAt
        : undefined;

    for await (const pipeline of this.circleCI.fetchPipelines(
      streamSlice.projectName,
      since
    )) {
      for (const workflow of pipeline.workflows ?? []) {
        for (const job of workflow.jobs ?? []) {
          const tests = await this.circleCI.fetchTests(
            pipeline.project_slug,
            job.job_number
          );
          for (const test of tests) {
            yield {
              ...test,
              pipeline_id: pipeline.id,
              pipeline_vcs: pipeline.vcs,
              project_slug: pipeline.project_slug,
              workflow_id: workflow.id,
              workflow_name: workflow.name,
              job_number: job.job_number,
              job_started_at: job.started_at,
              job_stopped_at: job.stopped_at,
            };
          }
        }
      }
    }
  }

  getUpdatedState(
    currentStreamState: TestsState,
    latestRecord: TestMetadata
  ): TestsState {
    const projectName = latestRecord.project_slug;
    const state = currentStreamState[projectName] ?? {};

    const newState = {
      lastUpdatedAt:
        new Date(latestRecord.job_stopped_at) >
        new Date(state.lastUpdatedAt ?? 0)
          ? latestRecord.job_stopped_at
          : state.lastUpdatedAt,
    };
    return {...currentStreamState, [projectName]: newState};
  }
}
