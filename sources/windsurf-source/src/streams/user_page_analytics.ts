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
      const minUsageTimestamp = Math.min(
        minUsageTimestampPerEmail[user.email] ?? Infinity,
        windsurf.getMinUsageTimestampForEmail(user.email) ?? Infinity
      );
      yield {
        ...user,
        ...(minUsageTimestamp !== Infinity && {minUsageTimestamp}),
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
    return {
      minUsageTimestampPerEmail: {
        ...currentStreamState?.minUsageTimestampPerEmail,
        [latestRecord.email]: latestRecord.minUsageTimestamp,
      },
    };
  }
}
