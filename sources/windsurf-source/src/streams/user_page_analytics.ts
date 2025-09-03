import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {UserTableStatsItem, WindsurfConfig} from '../types';
import {Windsurf} from '../windsurf';

type StreamState = {
  minUsageTimestampPerEmail: {[email: string]: number};
};

export class UserPageAnalytics extends AirbyteStreamBase {
  constructor(
    private readonly config: WindsurfConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  get dependencies(): string[] {
    return ['autocomplete_analytics', 'cascade_lines_analytics'];
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/userPageAnalytics.json');
  }

  get primaryKey(): StreamKey {
    return ['email'];
  }

  get cursorField(): string | string[] {
    return 'minUsageTimestamp';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any>,
    streamState?: StreamState
  ): AsyncGenerator<UserTableStatsItem> {
    const minUsageTimestampPerEmail =
      streamState?.minUsageTimestampPerEmail ?? {};
    const windsurf = Windsurf.instance(this.config, this.logger);
    const userStats = await windsurf.getUserPageAnalytics();

    for (const user of userStats) {
      const allUsageTimestamps = windsurf.getUsageTimestampsForEmail(
        user.email
      );

      // Calculate minimum usage timestamp from collected timestamps and state
      const stateMinTimestamp = minUsageTimestampPerEmail[user.email]
        ? new Date(minUsageTimestampPerEmail[user.email]).getTime()
        : Infinity;
      const collectedMinTimestamp =
        allUsageTimestamps.length > 0
          ? Math.min(...allUsageTimestamps)
          : Infinity;
      const minUsageTimestamp = Math.min(
        stateMinTimestamp,
        collectedMinTimestamp
      );

      yield {
        ...user,
        usageTimestamps: allUsageTimestamps.map((ts) =>
          new Date(ts).toISOString()
        ),
        ...(minUsageTimestamp !== Infinity && {
          minUsageTimestamp: new Date(minUsageTimestamp).toISOString(),
        }),
      };
    }
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: UserTableStatsItem
  ): StreamState {
    if (!latestRecord.minUsageTimestamp) {
      return currentStreamState;
    }
    // Convert ISO string back to timestamp for state storage
    const timestamp = new Date(latestRecord.minUsageTimestamp).getTime();
    return {
      minUsageTimestampPerEmail: {
        ...currentStreamState?.minUsageTimestampPerEmail,
        [latestRecord.email]: timestamp,
      },
    };
  }
}
