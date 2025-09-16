import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {ClaudeCode} from '../claude_code';
import {ClaudeCodeConfig, UserItem} from '../types';

export class Users extends AirbyteStreamBase {
  constructor(
    private readonly config: ClaudeCodeConfig,
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

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any>,
    streamState?: any
  ): AsyncGenerator<UserItem> {
    const claudeCode = ClaudeCode.instance(this.config, this.logger);
    for await (const user of claudeCode.getUsers(this.config.page_size)) {
      yield user;
    }
  }
}
