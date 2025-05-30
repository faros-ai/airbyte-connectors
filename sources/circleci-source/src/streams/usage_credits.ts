import {SyncMode} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';
import Papa from 'papaparse';

import {CircleCI} from '../circleci/circleci';
import {StreamSlice, StreamWithProjectSlices} from './common';

interface UsageExportRow {
  job_id: string;
  job_run_ended_at: string;
  compute_credits?: number;
  dlc_credits?: number;
  user_credits?: number;
  storage_credits?: number;
  network_credits?: number;
  lease_credits?: number;
  lease_overage_credits?: number;
  ipranges_credits?: number;
  total_credits?: number;
  [key: string]: any; // Allow additional fields
}

type UsageCreditsState = Dictionary<{
  processedJobIds: string[];
  lastProcessedAt?: string;
}>;

export class UsageCredits extends StreamWithProjectSlices {
  private metricDefinitionCreated = false;

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/usage_credits.json');
  }

  get primaryKey(): string[] {
    return ['uid'];
  }

  get cursorField(): string[] {
    return ['computedAt'];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: StreamSlice,
    streamState?: UsageCreditsState
  ): AsyncGenerator<any, any, unknown> {
    if (!this.metricDefinitionCreated) {
      yield {
        uid: 'circleci_job_usage',
        name: 'CircleCI Job Usage',
        description: 'Credit usage metrics by CircleCI jobs',
        valueType: {
          category: 'Numeric',
          detail: 'Credits used per job, by type'
        },
        scorecardCompatible: false,
        valueSource: 'CircleCI Usage API'
      };
      this.metricDefinitionCreated = true;
    }

    const circleCI = CircleCI.instance(this.cfg, this.logger);
    
    const projectSlugParts = streamSlice.projectSlug.split('/');
    if (projectSlugParts.length !== 3) {
      this.logger.warn(`Invalid project slug format: ${streamSlice.projectSlug}`);
      return;
    }
    const orgId = projectSlugParts[1];

    const projectState = streamState?.[streamSlice.projectSlug] || {
      processedJobIds: [],
      lastProcessedAt: undefined
    };

    const now = new Date();
    const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);
    const lookbackTime = projectState.lastProcessedAt 
      ? new Date(Math.max(new Date(projectState.lastProcessedAt).getTime(), twelveHoursAgo.getTime()))
      : twelveHoursAgo;

    const jobIds = this.cfg.usage_export_job_ids || [];
    
    for (const jobId of jobIds) {
      if (projectState.processedJobIds.includes(jobId)) {
        continue; // Skip already processed jobs
      }

      try {
        const usageExport = await circleCI.fetchUsageExport(orgId, jobId);
        
        if (usageExport.status === 'completed' && usageExport.csv_data) {
          const parsedCsv = Papa.parse<UsageExportRow>(usageExport.csv_data, {
            header: true,
            skipEmptyLines: true,
          });

          for (const row of parsedCsv.data) {
            const jobRunEndedAt = new Date(row.job_run_ended_at);
            
            if (jobRunEndedAt >= lookbackTime) {
              const creditTypes = [
                'compute_credits',
                'dlc_credits', 
                'user_credits',
                'storage_credits',
                'network_credits',
                'lease_credits',
                'lease_overage_credits',
                'ipranges_credits',
                'total_credits'
              ];

              for (const creditType of creditTypes) {
                if (row[creditType] !== undefined && row[creditType] !== null) {
                  yield {
                    uid: `${row.job_id}_${creditType}`,
                    value: String(row[creditType]),
                    computedAt: row.job_run_ended_at,
                    definition: {uid: 'circleci_job_usage'}
                  };
                }
              }
            }
          }
          
          projectState.processedJobIds.push(jobId);
        }
      } catch (error: any) {
        this.logger.error(`Error processing usage export job ${jobId}: ${error.message}`);
      }
    }
  }

  getUpdatedState(
    currentStreamState: UsageCreditsState,
    latestRecord: any,
    streamSlice?: StreamSlice
  ): UsageCreditsState {
    const projectSlug = streamSlice?.projectSlug;
    if (!projectSlug) {
      return currentStreamState;
    }
    
    const projectState = currentStreamState[projectSlug] || {
      processedJobIds: [],
      lastProcessedAt: undefined
    };

    return {
      ...currentStreamState,
      [projectSlug]: {
        ...projectState,
        lastProcessedAt: new Date().toISOString()
      }
    };
  }
}
