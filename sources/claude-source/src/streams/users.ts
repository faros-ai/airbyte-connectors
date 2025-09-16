import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Claude} from '../claude';
import {ClaudeConfig, UserItem} from '../types';

export class Users extends AirbyteStreamBase {
  constructor(
    private readonly config: ClaudeConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/users.json');
  }

  get primaryKey(): StreamKey {
    return ['id'];
  }

  get cursorField(): string | string[] {
    return 'added_at';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any>,
    streamState?: any
  ): AsyncGenerator<UserItem> {
    const claude = Claude.instance(this.config, this.logger);
    for await (const user of claude.getUsers(this.config.page_size)) {
      yield user;
    }
  }
}
