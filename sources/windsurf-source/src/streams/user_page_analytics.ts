import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {UserTableStatsItem, WindsurfConfig} from '../types';
import {Windsurf} from '../windsurf';

export class UserPageAnalytics extends AirbyteStreamBase {
  constructor(
    private readonly config: WindsurfConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/userPageAnalytics.json');
  }

  get primaryKey(): StreamKey {
    return ['email'];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any>,
    streamState?: Dictionary<any>
  ): AsyncGenerator<UserTableStatsItem> {
    const windsurf = Windsurf.instance(this.config, this.logger);
    const userStats = await windsurf.getUserPageAnalytics();

    for (const user of userStats) {
      yield user;
    }
  }
}
