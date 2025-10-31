import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {isNil} from 'lodash';
import {DateTime} from 'luxon';
import {Dictionary} from 'ts-essentials';

import {Run} from '../models';
import {
  DEFAULT_MAX_RUN_DURATION_DAYS,
  TestRails,
  TestRailsConfig,
} from '../testrails/testrails';

export interface RunState {
  cutoff: number;
}

export class Runs extends AirbyteStreamBase {
  private syncStartedAt: Date = null;

  constructor(
    private readonly config: TestRailsConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/run.json');
  }
  get primaryKey(): StreamKey {
    return ['project_id', 'suite_id', 'id'];
  }
  get cursorField(): string | string[] {
    return 'created_on';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any, string>,
    streamState?: RunState
  ): AsyncGenerator<Run> {
    const testRails = await TestRails.instance(this.config, this.logger);

    // Calculate start date with look-back window for incremental syncs
    // This allows us to re-fetch runs that may have been updated after creation
    const startDate =
      syncMode === SyncMode.INCREMENTAL && !isNil(streamState?.cutoff)
        ? DateTime.fromMillis(streamState.cutoff)
            .minus({
              days:
                this.config.max_run_duration_days ??
                DEFAULT_MAX_RUN_DURATION_DAYS,
            })
            .toSeconds()
        : undefined;

    if (!this.syncStartedAt) {
      this.syncStartedAt = new Date();
    }

    yield* testRails.getRuns(startDate);
  }

  /**
   * Runs API always returns records sorted by created_on
   * and runs can be updated at any time (e.g., when completed_on changes),
   * so for making incremental syncs possible we assume they need to be
   * completed within X days after creation, where X is the
   * max_run_duration_days config value.
   *
   * This means we look back X days from the last cutoff to re-fetch
   * runs that may have been updated since the last sync.
   */
  getUpdatedState(currentStreamState: RunState, latestRecord: Run): RunState {
    const syncStartedAtMillis = this.syncStartedAt.getTime();
    return {
      cutoff: Math.max(currentStreamState?.cutoff ?? 0, syncStartedAtMillis),
    };
  }
}
