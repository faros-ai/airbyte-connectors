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
  get cursorField(): string | string[] {
    return 'createdAt';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: User,
    streamState?: VictoropsState
  ): AsyncGenerator<User> {
    const victorops = Victorops.instance(this.config, this.logger);
    const state = syncMode === SyncMode.INCREMENTAL ? streamState : null;
    yield* victorops.getUsers(state);
  }

  getUpdatedState(
    currentStreamState: VictoropsState,
    latestRecord: User
  ): VictoropsState {
    return {
      cutoff:
        currentStreamState.cutoff &&
        new Date(currentStreamState.cutoff) > new Date(latestRecord.createdAt)
          ? currentStreamState.cutoff
          : latestRecord.createdAt,
    };
  }
}
