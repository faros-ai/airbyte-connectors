import {addDays, subDays} from 'date-fns';
import {SyncMode} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {
  CircleCI,
  DEFAULT_CUTOFF_DAYS,
  DEFAULT_USAGE_EXPORT_MIN_GAP_HOURS,
  UsageExportJobCreate,
  UsageExportJobGet,
} from '../circleci/circleci';
import {OrganizationSlice, StreamWithOrganizationSlices} from './common';

interface UsageState {
  start: string;
  end: string;
  job_id: string;
  state: string;
  error_reason?: string;
}

type UsageStreamState = {[orgId: string]: UsageState | undefined};

// https://circleci.com/docs/api/v2/index.html#tag/Usage
const MAX_EXPORT_WINDOW_DAYS = 31; // CircleCI API limit

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

  // Not used, but necessary to pass Airbyte UI validation check
  get cursorField(): string | string[] {
    return 'usage_export_job_id';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: OrganizationSlice,
    streamState?: UsageStreamState
  ): AsyncGenerator<
    {org_id: string; org_slug: string} & (
      | UsageExportJobGet
      | UsageExportJobCreate
    )
  > {
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

      let jobStatus: UsageExportJobGet;
      if (orgState.state === 'created' || orgState.state === 'processing') {
        // Check the status of the existing job
        jobStatus = await circleCI.getUsageExport(
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

        // If the job is still created or processing, we should return after yielding the status
        if (jobStatus.state === 'created' || jobStatus.state === 'processing') {
          return;
        }
      }

      if ((jobStatus?.state ?? orgState.state) === 'failed') {
        const errorReason = jobStatus?.error_reason ?? orgState.error_reason;
        this.logger.warn(
          `Usage export job ${orgState.job_id} failed for org ${streamSlice.orgId}, error reason: ${errorReason}. Creating new export`
        );

        const failedStart = new Date(orgState.start);
        const failedEnd = new Date(orgState.end);

        // If the failed window is smaller than the API limit, extend it towards now()
        const failedWindowMs = failedEnd.getTime() - failedStart.getTime();
        let retryEnd = failedEnd;

        if (failedWindowMs < MAX_EXPORT_WINDOW_DAYS * DAYS_IN_MS) {
          // Try to extend the window towards now while respecting the API limit
          const maxPossibleEnd = addDays(failedStart, MAX_EXPORT_WINDOW_DAYS);
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

        if (!newJob) {
          return;
        }

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
      if ((jobStatus?.state ?? orgState.state) === 'completed') {
        const incrementalStart = new Date(orgState.end);
        let incrementalEnd = now;

        // Check if enough time has passed since the last export window
        const minGapHours =
          this.cfg.usage_export_min_gap_hours ??
          DEFAULT_USAGE_EXPORT_MIN_GAP_HOURS;
        const timeSinceLastExportMs =
          now.getTime() - incrementalStart.getTime();

        if (timeSinceLastExportMs < minGapHours * HOURS_IN_MS) {
          const hoursSinceLastExport = timeSinceLastExportMs / HOURS_IN_MS;
          this.logger.info(
            `Skipping incremental export for org ${streamSlice.orgId}. Only ${hoursSinceLastExport.toFixed(1)} hours have passed since last export (minimum: ${minGapHours} hours)`
          );
          return;
        }

        // Check if the time window exceeds API limit
        const windowMs = now.getTime() - incrementalStart.getTime();

        if (windowMs > MAX_EXPORT_WINDOW_DAYS * DAYS_IN_MS) {
          // Limit to the next window
          incrementalEnd = addDays(incrementalStart, MAX_EXPORT_WINDOW_DAYS);

          this.logger.info(
            `Incremental window exceeds API limit (${MAX_EXPORT_WINDOW_DAYS} days). Creating export from ${incrementalStart.toISOString()} to ${incrementalEnd.toISOString()}`
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

        if (!job) {
          return;
        }

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
    const exportStart = subDays(now, cutoffDays);

    let exportEnd = now;
    // If cutoff period exceeds API limit, start from the oldest window
    if (cutoffDays > MAX_EXPORT_WINDOW_DAYS) {
      // Start from the oldest window and limit the end date
      exportEnd = addDays(exportStart, MAX_EXPORT_WINDOW_DAYS);

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

    if (!job) {
      return;
    }

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
    latestRecord: {
      org_id: string;
      org_slug: string;
    } & (UsageExportJobGet | UsageExportJobCreate)
  ): UsageStreamState {
    // Update state with the latest job information
    const newState = {...currentStreamState};

    newState[latestRecord.org_id] = {
      start: latestRecord.start ?? newState[latestRecord.org_id]?.start,
      end: latestRecord.end ?? newState[latestRecord.org_id]?.end,
      job_id: latestRecord.usage_export_job_id,
      state: latestRecord.state,
      ...(latestRecord.error_reason && {
        error_reason: latestRecord.error_reason,
      }),
    };

    return newState;
  }
}
