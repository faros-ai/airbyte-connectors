import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {StatsRecord, StatsType} from 'faros-airbyte-common/github';
import {DateTime} from 'luxon';
import {Dictionary} from 'ts-essentials';

import {GitHub} from '../github';
import {StreamBase, StreamWithRepoSlices} from './common';

export {StatsRecord, StatsType} from 'faros-airbyte-common/github';

export type StatsStreamSlice = {
  org: string;
  repo: string;
  statsType: StatsType;
};

export type StatsStreamState = {
  readonly [statsType: string]: {
    readonly [orgRepoKey: string]: {
      cutoff: number;
    };
  };
};

export class FarosStats extends StreamWithRepoSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosStats.json');
  }

  get primaryKey(): StreamKey {
    return ['org', 'repo', 'type', 'start_timestamp'];
  }

  get cursorField(): string {
    return 'start_timestamp';
  }

  async *streamSlices(): AsyncGenerator<StatsStreamSlice> {
    for await (const repoSlice of super.streamSlices()) {
      for (const statsType of Object.values(StatsType)) {
        yield {...repoSlice, statsType};
      }
    }
  }

  async *readRecords(
    syncMode: SyncMode,
    _cursorField?: string[],
    streamSlice?: StatsStreamSlice,
    streamState?: StatsStreamState
  ): AsyncGenerator<StatsRecord> {
    const {org, repo, statsType} = streamSlice;
    const orgRepoKey = StreamBase.orgRepoKey(org, repo);
    const state = streamState?.[statsType]?.[orgRepoKey];

    // Use the existing pattern to get startDate and endDate
    const [startDate, endDate] =
      syncMode === SyncMode.INCREMENTAL
        ? this.getUpdateRange(state?.cutoff)
        : this.getUpdateRange();

    const github = await GitHub.instance(this.config, this.logger);

    if (statsType === StatsType.MERGED_PRS_PER_MONTH) {
      // Get months to process based on startDate and endDate
      const monthsToProcess = this.getMonthsToProcess(startDate, endDate);

      for (const month of monthsToProcess) {
        const count = await github.searchMergedPRsCount(
          org,
          repo,
          month.start.toJSDate(),
          month.end.toJSDate()
        );

        yield {
          org,
          repo,
          type: StatsType.MERGED_PRS_PER_MONTH,
          start_timestamp: month.start.toISO(),
          end_timestamp: month.end.toISO(),
          count,
        };
      }
    }
  }

  /**
   * Get months to process from startDate to endDate.
   * Both dates are normalized to the start of their respective months.
   * If endDate is not provided, defaults to current month.
   */
  private getMonthsToProcess(
    startDate: Date,
    endDate?: Date
  ): Array<{start: DateTime; end: DateTime}> {
    // Normalize startDate to month start
    const startMonth = DateTime.fromJSDate(startDate, {zone: 'utc'}).startOf(
      'month'
    );

    // Use endDate if provided, otherwise default to current month
    const endMonth = endDate
      ? DateTime.fromJSDate(endDate, {zone: 'utc'}).startOf('month')
      : DateTime.utc().startOf('month');

    // Generate list of months from startMonth to endMonth
    const months: Array<{start: DateTime; end: DateTime}> = [];
    let month = startMonth;

    while (month <= endMonth) {
      months.push({
        start: month,
        end: month.endOf('month'),
      });
      month = month.plus({months: 1});
    }

    return months;
  }

  getUpdatedState(
    currentStreamState: StatsStreamState,
    latestRecord: StatsRecord,
    slice: StatsStreamSlice
  ): StatsStreamState {
    const {statsType} = slice;
    const orgRepoKey = StreamBase.orgRepoKey(slice.org, slice.repo);
    const recordMonthStart = DateTime.fromISO(latestRecord.start_timestamp, {
      zone: 'utc',
    }).startOf('month');

    const currentCutoff =
      currentStreamState?.[statsType]?.[orgRepoKey]?.cutoff ?? 0;

    // Only update if this month is newer than stored state
    if (recordMonthStart.toMillis() > currentCutoff) {
      return {
        ...currentStreamState,
        [statsType]: {
          ...currentStreamState?.[statsType],
          [orgRepoKey]: {
            cutoff: recordMonthStart.toMillis(),
          },
        },
      };
    }

    return currentStreamState;
  }
}
