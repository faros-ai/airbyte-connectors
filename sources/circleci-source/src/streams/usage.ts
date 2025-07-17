import {SyncMode} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {
  CircleCI,
  DEFAULT_CUTOFF_DAYS,
  DEFAULT_USAGE_EXPORT_MIN_GAP_HOURS,
  UsageExportJob,
} from '../circleci/circleci';
import {OrganizationSlice, StreamWithOrganizationSlices} from './common';

interface UsageState {
  start: string;
  end: string;
  job_id: string;
  state: string;
}

type UsageStreamState = {[orgId: string]: UsageState | undefined};

// https://circleci.com/docs/api/v2/index.html#tag/Usage
const MAX_EXPORT_WINDOW_DAYS = 32; // CircleCI API limit

const HOURS_IN_MS = 1000 * 60 * 60;
const DAYS_IN_MS = HOURS_IN_MS * 24;

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

        const failedStart = new Date(orgState.start);
        const failedEnd = new Date(orgState.end);

        // If the failed window is smaller than the API limit, extend it towards now()
        const failedWindowDays = Math.ceil(
          (failedEnd.getTime() - failedStart.getTime()) / DAYS_IN_MS
        );
        let retryEnd = failedEnd;

        if (failedWindowDays < MAX_EXPORT_WINDOW_DAYS) {
          // Try to extend the window towards now while respecting the API limit
          const maxPossibleEnd = new Date(failedStart);
          maxPossibleEnd.setDate(
            maxPossibleEnd.getDate() + MAX_EXPORT_WINDOW_DAYS
          );
          retryEnd = maxPossibleEnd < now ? maxPossibleEnd : now;
          this.logger.info(
            `Extending failed export window end from ${failedEnd.toISOString()} to ${retryEnd.toISOString()} for org ${streamSlice.orgId}`
          );
        }

        const newJob = await circleCI.createUsageExport(
          streamSlice.orgId,
          failedStart.toISOString(),
          retryEnd.toISOString()
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
        const incrementalStart = new Date(orgState.end);
        let incrementalEnd = now;

        // Check if enough time has passed since the last export window
        const minGapHours =
          this.cfg.usage_export_min_gap_hours ??
          DEFAULT_USAGE_EXPORT_MIN_GAP_HOURS;
        const hoursSinceLastExport =
          (now.getTime() - incrementalStart.getTime()) / HOURS_IN_MS;

        if (hoursSinceLastExport < minGapHours) {
          this.logger.info(
            `Skipping incremental export for org ${streamSlice.orgId}. Only ${hoursSinceLastExport.toFixed(1)} hours have passed since last export (minimum: ${minGapHours} hours)`
          );
          return;
        }

        // Check if the time window exceeds API limit
        const daysDiff = Math.ceil(
          (now.getTime() - incrementalStart.getTime()) / DAYS_IN_MS
        );

        if (daysDiff > MAX_EXPORT_WINDOW_DAYS) {
          // Limit to the next window
          incrementalEnd = new Date(incrementalStart);
          incrementalEnd.setDate(
            incrementalEnd.getDate() + MAX_EXPORT_WINDOW_DAYS
          );

          this.logger.info(
            `Incremental window (${daysDiff} days) exceeds API limit. Creating export from ${incrementalStart.toISOString()} to ${incrementalEnd.toISOString()}`
          );
        }

        this.logger.info(
          `Creating incremental usage export for org ${streamSlice.orgId} from ${incrementalStart.toISOString()} to ${incrementalEnd.toISOString()}`
        );

        const job = await circleCI.createUsageExport(
          streamSlice.orgId,
          incrementalStart.toISOString(),
          incrementalEnd.toISOString()
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
    const cutoffDays = this.cfg.cutoff_days ?? DEFAULT_CUTOFF_DAYS;
    const exportStart = new Date(now);
    exportStart.setDate(exportStart.getDate() - cutoffDays);

    let exportEnd = now;
    // If cutoff period exceeds API limit, start from the oldest window
    if (cutoffDays > MAX_EXPORT_WINDOW_DAYS) {
      // Start from the oldest window and limit the end date
      exportEnd = new Date(exportStart);
      exportEnd.setDate(exportEnd.getDate() + MAX_EXPORT_WINDOW_DAYS);

      this.logger.info(
        `Cutoff period (${cutoffDays} days) exceeds API limit (${MAX_EXPORT_WINDOW_DAYS} days). Starting with oldest window from ${exportStart.toISOString()} to ${exportEnd.toISOString()}`
      );
    }

    this.logger.info(
      `Creating initial usage export for org ${streamSlice.orgId} from ${exportStart.toISOString()} to ${exportEnd.toISOString()}`
    );

    const job = await circleCI.createUsageExport(
      streamSlice.orgId,
      exportStart.toISOString(),
      exportEnd.toISOString()
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
