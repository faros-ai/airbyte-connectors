import {SyncMode} from 'faros-airbyte-cdk';
import {TestMetadata} from 'faros-airbyte-common/circleci';
import {Dictionary} from 'ts-essentials';

import {CircleCI} from '../circleci/circleci';
import {StreamSlice, StreamWithProjectSlices} from './common';

type TestsState = Dictionary<{lastUpdatedAt?: string}>;

export class Tests extends StreamWithProjectSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/tests.json');
  }

  get primaryKey(): string[] {
    return ['project_slug', 'job_number'];
  }

  get cursorField(): string[] {
    return ['job_stopped_at'];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: StreamSlice,
    streamState?: TestsState
  ): AsyncGenerator<TestMetadata, any, unknown> {
    const circleCI = CircleCI.instance(this.cfg, this.logger);
    const since =
      syncMode === SyncMode.INCREMENTAL
        ? streamState?.[streamSlice.projectSlug]?.lastUpdatedAt
        : undefined;

    for await (const pipeline of circleCI.fetchPipelines(
      streamSlice.projectSlug,
      since
    )) {
      const jobsWithUndefinedNumbers: string[] = [];
      const seenJobs = new Set<number>();
      for (const workflow of pipeline.workflows ?? []) {
        for (const job of workflow.jobs ?? []) {
          const jobNum = job.job_number;
          if (jobNum === undefined) {
            jobsWithUndefinedNumbers.push(job.id);
            continue;
          }
          if (seenJobs.has(jobNum)) {
            this.logger.warn(
              `Tests already seen for job [${jobNum}] in project [${pipeline.project_slug}] - Skipping additional occurrence`
            );
            continue;
          }
          seenJobs.add(jobNum);

          const tests = circleCI.fetchTests(
            pipeline.project_slug,
            job.job_number
          );
          for await (const test of tests) {
            yield {
              ...test,
              pipeline_id: pipeline.id,
              pipeline_vcs: pipeline.vcs,
              project_slug: pipeline.project_slug,
              workflow_id: workflow.id,
              workflow_name: workflow.name,
              job_id: job.id,
              job_number: job.job_number,
              job_started_at: job.started_at,
              job_stopped_at: job.stopped_at,
            };
          }
        }
      }
      if (jobsWithUndefinedNumbers.length) {
        this.logger.debug(
          `Jobs with undefined numbers for project ${pipeline.project_slug}: ${jobsWithUndefinedNumbers.join(',')}`
        );
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
