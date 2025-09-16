import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {DateTime} from 'luxon';
import {Dictionary} from 'ts-essentials';

import {ClaudeCode} from '../claude_code';
import {ClaudeCodeConfig, UsageReportItem} from '../types';

type StreamState = {
  cutoff?: string;
};

export class ClaudeCodeUsageReport extends AirbyteStreamBase {
  constructor(
    private readonly config: ClaudeCodeConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/claudeCodeUsageReport.json');
  }

  get primaryKey(): StreamKey {
    return ['date', 'actor'];
  }

  get cursorField(): string | string[] {
    return 'date';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any>,
    streamState?: StreamState
  ): AsyncGenerator<UsageReportItem> {
    const claudeCode = ClaudeCode.instance(this.config, this.logger);

    // For incremental sync, use the cutoff date from state, otherwise use configured date range
    let startDate: DateTime;
    if (syncMode === SyncMode.INCREMENTAL && streamState?.cutoff) {
      // Start from the last synced date for incremental
      startDate = DateTime.fromISO(streamState.cutoff);
    } else {
      startDate = DateTime.fromJSDate(this.config.startDate);
    }

    // End date is either configured or today
    const endDate = this.config.endDate
      ? DateTime.fromJSDate(this.config.endDate)
      : DateTime.now();

    this.logger.info(
      `Fetching usage report from ${startDate.toISODate()} to ${endDate.toISODate()}`
    );

    // Iterate through each date from startDate to endDate
    let currentDate = startDate;
    while (currentDate <= endDate) {
      const dateStr = currentDate.toFormat('yyyy-MM-dd');
      this.logger.info(`Fetching usage report for date: ${dateStr}`);

      // The API fetches data for a single date
      for await (const item of claudeCode.getUsageReport(
        dateStr,
        this.config.page_size
      )) {
        yield item;
      }

      // Move to the next day
      currentDate = currentDate.plus({days: 1});
    }
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: UsageReportItem
  ): StreamState {
    const currentCutoff = currentStreamState?.cutoff;
    const recordDate = latestRecord.date;

    // Update state with the latest date seen
    if (!currentCutoff || recordDate > currentCutoff) {
      return {
        cutoff: recordDate,
      };
    }

    return currentStreamState;
  }
}
