import {SyncMode} from 'faros-airbyte-cdk';
import {TestMetadata} from 'faros-airbyte-common/circleci';
import {Dictionary} from 'ts-essentials';

import {CircleCI} from '../circleci/circleci';
import {StreamSlice, StreamWithProjectSlices} from './common';

export class Tests extends StreamWithProjectSlices {
  get dependencies(): ReadonlyArray<string> {
    return ['pipelines'];
  }

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
    streamSlice?: StreamSlice
  ): AsyncGenerator<TestMetadata, any, unknown> {
    const circleCI = CircleCI.instance(this.cfg, this.logger);

    const jobs = circleCI.getFetchedJobs(streamSlice.projectSlug);
    const jobsWithUndefinedNumbers: string[] = [];
    const seenJobs = new Set<number>();
    for (const job of jobs) {
      const jobNum = job.job_number;
      if (jobNum === undefined) {
        jobsWithUndefinedNumbers.push(job.id);
        continue;
      }
      if (seenJobs.has(jobNum)) {
        this.logger.warn(
          `Tests already seen for job [${jobNum}] in project [${job.pipeline.project_slug}] - Skipping additional occurrence`
        );
        continue;
      }
      seenJobs.add(jobNum);

      const tests = circleCI.fetchTests(
        streamSlice.projectSlug,
        job.job_number
      );
      for await (const test of tests) {
        yield {
          ...test,
          pipeline_id: job.pipeline.id,
          pipeline_vcs: job.pipeline.vcs,
          project_slug: job.pipeline.project_slug,
          workflow_id: job.workflow.id,
          workflow_name: job.workflow.name,
          job_id: job.id,
          job_number: job.job_number,
          job_started_at: job.started_at,
          job_stopped_at: job.stopped_at,
        };
      }
    }
    if (jobsWithUndefinedNumbers.length) {
      this.logger.debug(
        `Jobs with undefined numbers for project ${streamSlice.projectSlug}: ${jobsWithUndefinedNumbers.join(',')}`
      );
    }
  }
}
