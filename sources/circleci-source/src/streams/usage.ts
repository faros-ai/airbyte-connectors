import {SyncMode} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {CircleCI, UsageExportJob} from '../circleci/circleci';
import {OrganizationSlice, StreamWithOrganizationSlices} from './common';

interface UsageState {
  start: string;
  end: string;
  job_id: string;
  state: string;
}

type UsageStreamState = {[orgId: string]: UsageState | undefined};

const INITIAL_CUTOFF_DAYS = 30;

export class Usage extends StreamWithOrganizationSlices {
  private syncTimestamp: Date;

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/usage.json');
  }

  get primaryKey(): string[] {
    return ['usage_export_job_id'];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: OrganizationSlice,
    streamState?: UsageStreamState
  ): AsyncGenerator<{org_id: string; org_slug: string} & UsageExportJob> {
    const circleCI = CircleCI.instance(this.cfg, this.logger);

    // Initialize sync timestamp once for all slices
    if (!this.syncTimestamp) {
      this.syncTimestamp = new Date();
    }

    const orgState = streamState?.[streamSlice.orgId];
    const now = this.syncTimestamp;

    this.logger.info(
      `Processing usage for organization ${streamSlice.orgSlug} (${streamSlice.orgId})`
    );

    // Check if we have an existing job
    if (orgState?.job_id) {
      this.logger.debug(
        `Found existing job ${orgState.job_id} in state ${orgState.state} for org ${streamSlice.orgId}`
      );

      if (orgState.state === 'created' || orgState.state === 'processing') {
        // Check the status of the existing job
        const jobStatus = await circleCI.getUsageExport(
          streamSlice.orgId,
          orgState.job_id
        );

        this.logger.info(
          `Usage export job ${orgState.job_id} status: ${jobStatus.state} for org ${streamSlice.orgId}`
        );

        // Always yield the current job status with org info
        yield {
          org_id: streamSlice.orgId,
          org_slug: streamSlice.orgSlug,
          ...jobStatus,
        };
        return;
      }

      if (orgState.state === 'failed') {
        this.logger.warn(
          `Usage export job ${orgState.job_id} failed for org ${streamSlice.orgId}, creating new export`
        );

        // Create new export with same start time unless it's too old
        const existingStart = new Date(orgState.start);
        const initialStart = new Date(now);
        initialStart.setDate(initialStart.getDate() - 30);

        const startTime =
          existingStart < initialStart ? initialStart : existingStart;

        const newJob = await circleCI.createUsageExport(
          streamSlice.orgId,
          startTime.toISOString(),
          now.toISOString()
        );

        this.logger.info(
          `Created new usage export job ${newJob.usage_export_job_id} for org ${streamSlice.orgId}`
        );

        yield {
          org_id: streamSlice.orgId,
          org_slug: streamSlice.orgSlug,
          ...newJob,
        };
        return;
      }

      // Check if we have a completed state, create incremental export
      if (orgState.state === 'completed' && orgState.end) {
        this.logger.info(
          `Creating incremental usage export for org ${streamSlice.orgId} from ${orgState.end}`
        );

        const job = await circleCI.createUsageExport(
          streamSlice.orgId,
          orgState.end,
          now.toISOString()
        );

        this.logger.info(
          `Created incremental usage export job ${job.usage_export_job_id} for org ${streamSlice.orgId}`
        );

        yield {
          org_id: streamSlice.orgId,
          org_slug: streamSlice.orgSlug,
          ...job,
        };
        return;
      }
    }

    // First time processing this org - create initial export
    const initialStart = new Date(now);
    initialStart.setDate(initialStart.getDate() - INITIAL_CUTOFF_DAYS);

    this.logger.info(
      `Creating initial usage export for org ${streamSlice.orgId} from ${initialStart.toISOString()} to ${now.toISOString()}`
    );

    const job = await circleCI.createUsageExport(
      streamSlice.orgId,
      initialStart.toISOString(),
      now.toISOString()
    );

    this.logger.info(
      `Created initial usage export job ${job.usage_export_job_id} for org ${streamSlice.orgId}`
    );

    yield {
      org_id: streamSlice.orgId,
      org_slug: streamSlice.orgSlug,
      ...job,
    };
  }

  getUpdatedState(
    currentStreamState: UsageStreamState,
    latestRecord: UsageExportJob & {org_id: string; org_slug: string}
  ): UsageStreamState {
    // Update state with the latest job information
    const newState = {...currentStreamState};

    newState[latestRecord.org_id] = {
      start: latestRecord.start,
      end: latestRecord.end,
      job_id: latestRecord.usage_export_job_id,
      state: latestRecord.state,
    };

    return newState;
  }
}
