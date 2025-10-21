import {parse} from 'csv-parse/sync';
import {AirbyteRecord, toDate} from 'faros-airbyte-cdk';
import {makeAxiosInstanceWithRetry} from 'faros-js-client';
import * as zlib from 'zlib';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {CircleCIConverter} from './common';

// Credit types from CircleCI usage CSV
const CREDIT_TYPES = [
  'COMPUTE_CREDITS',
  'DLC_CREDITS',
  'USER_CREDITS',
  'STORAGE_CREDITS',
  'NETWORK_CREDITS',
  'LEASE_CREDITS',
  'LEASE_OVERAGE_CREDITS',
  'IPRANGES_CREDITS',
  'TOTAL_CREDITS',
] as const;

interface UsageExportJob {
  usage_export_job_id: string;
  state: 'created' | 'processing' | 'completed' | 'failed';
  start: string;
  end: string;
  download_urls: string[] | null;
  org_id: string;
  org_slug: string;
}

interface UsageRecord {
  JOB_ID: string;
  JOB_RUN_DATE: string;
  COMPUTE_CREDITS: string;
  DLC_CREDITS: string;
  USER_CREDITS: string;
  STORAGE_CREDITS: string;
  NETWORK_CREDITS: string;
  LEASE_CREDITS: string;
  LEASE_OVERAGE_CREDITS: string;
  IPRANGES_CREDITS: string;
  TOTAL_CREDITS: string;
  [key: string]: string;
}

export class Usage extends CircleCIConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'faros_MetricDefinition',
    'faros_MetricValue',
  ];

  private static readonly METRIC_DEFINITION_UID = 'circleci_job_usage';
  private static metricDefinitionWritten = false;
  private readonly axios = makeAxiosInstanceWithRetry();

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const usage = record.record.data as UsageExportJob;

    let res: DestinationRecord[] = [];

    // Write metric definition once
    if (!Usage.metricDefinitionWritten) {
      res.push({
        model: 'faros_MetricDefinition',
        record: {
          uid: Usage.METRIC_DEFINITION_UID,
          name: 'CircleCI Job Usage',
          description: 'Credit usage metrics by CircleCI jobs',
          valueType: {
            category: 'Numeric',
            detail: 'Credits used per job, by type',
          },
          scorecardCompatible: false,
        },
      });
      Usage.metricDefinitionWritten = true;
    }

    // Only process completed exports with download URLs
    if (usage.state !== 'completed' || !usage.download_urls?.length) {
      ctx.logger.info(
        `Skipping usage export job ${usage.usage_export_job_id} because it is not completed or has no download URLs`
      );
      return res;
    }

    // Process each download URL (CSV file)
    for (const downloadUrl of usage.download_urls) {
      ctx.logger.info(`Processing CSV from job ${usage.usage_export_job_id}`);
      try {
        const csvData = await this.downloadAndParseCsv(downloadUrl, ctx);
        const metricValues = this.convertCsvToMetricValues(csvData);
        res = res.concat(metricValues);
      } catch (error: any) {
        ctx.logger.error(
          `Failed to process CSV from job ${usage.usage_export_job_id} at ${downloadUrl}: ${error.message}`
        );
      }
    }

    return res;
  }

  private async downloadAndParseCsv(
    url: string,
    ctx: StreamContext
  ): Promise<UsageRecord[]> {
    try {
      // Download the CSV.gz file
      const response = await this.axios.get(url, {
        responseType: 'arraybuffer',
      });

      const buffer = Buffer.from(response.data);

      // Decompress the gzipped CSV
      const csvContent = zlib.gunzipSync(buffer).toString('utf8');

      // Parse the CSV
      const records = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      }) as UsageRecord[];

      ctx.logger.debug(`Parsed ${records.length} usage records from CSV`);
      return records;
    } catch (error: any) {
      throw new Error(`Failed to download/parse CSV: ${error.message}`);
    }
  }

  private convertCsvToMetricValues(
    records: UsageRecord[]
  ): DestinationRecord[] {
    const metricValues: DestinationRecord[] = [];

    for (const record of records) {
      const computedAt = toDate(record.JOB_RUN_DATE);
      if (!computedAt) {
        continue; // Skip records with invalid dates
      }

      // Create a metric value for each credit type
      for (const creditType of CREDIT_TYPES) {
        const value = record[creditType];
        if (value && !isNaN(parseFloat(value)) && isFinite(parseFloat(value))) {
          metricValues.push({
            model: 'faros_MetricValue',
            record: {
              uid: `${record.JOB_ID}_${creditType.toLowerCase()}`,
              value: value,
              computedAt: computedAt.toISOString(),
              definition: {uid: Usage.METRIC_DEFINITION_UID},
            },
          });
        }
      }
    }

    return metricValues;
  }
}
