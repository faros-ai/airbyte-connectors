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

  get cursorField(): string | string[] {
    return 'lastUpdateTime';
  }

  async *readRecords(
    _syncMode: SyncMode,
    _cursorField?: string[],
    _streamSlice?: Dictionary<any>,
    _streamState?: Dictionary<any>
  ): AsyncGenerator<UserTableStatsItem> {
    const windsurf = Windsurf.instance(this.config, this.logger);
    const userStats = await windsurf.getUserPageAnalytics();

    for (const user of userStats) {
      yield user;
    }
  }
}
