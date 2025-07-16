import {SyncMode} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {CircleCI, UsageExportJob,UsageRecord} from '../circleci/circleci';
import {OrganizationSlice, StreamWithOrganizationSlices} from './common';

interface UsageState {
  start?: string;
  end?: string;
  job_id?: string;
  state?: string;
}

type UsageStreamState = Dictionary<UsageState>;

export class Usage extends StreamWithOrganizationSlices {
  private syncTimestamp: Date;
  private stateUpdates: Map<string, UsageState> = new Map();

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/usage.json');
  }

  get primaryKey(): string[] {
    return ['organization_id', 'job_run_date'];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: OrganizationSlice,
    streamState?: UsageStreamState
  ): AsyncGenerator<UsageRecord, any, unknown> {
    const circleCI = CircleCI.instance(this.cfg, this.logger);

    // Initialize sync timestamp once for all slices
    if (!this.syncTimestamp) {
      this.syncTimestamp = new Date();
    }

    const orgState = streamState?.[streamSlice.orgId] || {};
    const now = this.syncTimestamp;

    this.logger.info(
      `Processing usage for organization ${streamSlice.orgName} (${streamSlice.orgId})`
    );

    // Check if we have an existing job
    if (orgState.job_id) {
      this.logger.debug(
        `Found existing job ${orgState.job_id} in state ${orgState.state} for org ${streamSlice.orgId}`
      );

      if (orgState.state === 'created' || orgState.state === 'processing') {
        // Check the status of the existing job
        const jobStatus = await circleCI.getUsageExport(
          streamSlice.orgId,
          orgState.job_id
        );

        if (jobStatus.state === 'completed') {
          this.logger.info(
            `Usage export job ${orgState.job_id} completed for org ${streamSlice.orgId}`
          );

          // Update state to completed
          this.stateUpdates.set(streamSlice.orgId, {
            start: jobStatus.start,
            end: jobStatus.end,
            job_id: jobStatus.usage_export_job_id,
            state: jobStatus.state,
          });

          // Download and parse the files
          if (jobStatus.download_urls && jobStatus.download_urls.length > 0) {
            yield* circleCI.downloadAndParseUsageFiles(
              jobStatus.download_urls,
              streamSlice.orgId,
              streamSlice.orgName
            );
          }

          return;
        } else if (jobStatus.state === 'processing') {
          this.logger.info(
            `Usage export job ${orgState.job_id} still processing for org ${streamSlice.orgId}`
          );
          // Update state with current status
          this.stateUpdates.set(streamSlice.orgId, {
            start: jobStatus.start,
            end: jobStatus.end,
            job_id: jobStatus.usage_export_job_id,
            state: jobStatus.state,
          });
          return;
        } else if (jobStatus.state === 'failed') {
          this.logger.warn(
            `Usage export job ${orgState.job_id} failed for org ${streamSlice.orgId}, creating new export`
          );

          // Create new export with same start time unless it's too old
          const existingStart = new Date(orgState.start);
          const thirtyDaysAgo = new Date(now);
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

          const startTime =
            existingStart < thirtyDaysAgo ? thirtyDaysAgo : existingStart;

          const newJob = await circleCI.createUsageExport(
            streamSlice.orgId,
            startTime.toISOString(),
            now.toISOString()
          );

          this.logger.info(
            `Created new usage export job ${newJob.usage_export_job_id} for org ${streamSlice.orgId}`
          );

          // Update state with new job
          this.stateUpdates.set(streamSlice.orgId, {
            start: newJob.start,
            end: newJob.end,
            job_id: newJob.usage_export_job_id,
            state: newJob.state,
          });

          return;
        }
      }
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

      // Update state with new job
      this.stateUpdates.set(streamSlice.orgId, {
        start: job.start,
        end: job.end,
        job_id: job.usage_export_job_id,
        state: job.state,
      });

      return;
    }

    // First time processing this org - create initial export
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    this.logger.info(
      `Creating initial usage export for org ${streamSlice.orgId} from ${thirtyDaysAgo.toISOString()} to ${now.toISOString()}`
    );

    const job = await circleCI.createUsageExport(
      streamSlice.orgId,
      thirtyDaysAgo.toISOString(),
      now.toISOString()
    );

    this.logger.info(
      `Created initial usage export job ${job.usage_export_job_id} for org ${streamSlice.orgId}`
    );

    // Update state with new job
    this.stateUpdates.set(streamSlice.orgId, {
      start: job.start,
      end: job.end,
      job_id: job.usage_export_job_id,
      state: job.state,
    });
  }

  getUpdatedState(
    currentStreamState: UsageStreamState,
    latestRecord: UsageRecord
  ): UsageStreamState {
    // Apply any pending state updates
    const newState = {...currentStreamState};

    // Check if we have a state update for this organization
    const stateUpdate = this.stateUpdates.get(latestRecord.organization_id);
    if (stateUpdate) {
      newState[latestRecord.organization_id] = stateUpdate;
    }

    return newState;
  }
}
