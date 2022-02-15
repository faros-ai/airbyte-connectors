import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {User, Victorops, VictoropsConfig, VictoropsState} from '../victorops';

export class Users extends AirbyteStreamBase {
  constructor(readonly config: VictoropsConfig, logger: AirbyteLogger) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/users.json');
  }
  get primaryKey(): StreamKey {
    return 'username';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: User,
    streamState?: VictoropsState
  ): AsyncGenerator<User> {
    yield* Victorops.instance(this.config, this.logger).getUsers();
  }
}
