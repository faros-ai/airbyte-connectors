import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Statuspage, StatuspageConfig, User} from '../statuspage';

interface UsersState {
  cutoff: string;
}

export class Users extends AirbyteStreamBase {
  constructor(
    private readonly config: StatuspageConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/users.json');
  }
  get primaryKey(): StreamKey {
    return 'id';
  }
  get cursorField(): string | string[] {
    return 'updated_at';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any, string>,
    streamState?: Dictionary<any, string>
  ): AsyncGenerator<User> {
    const statuspage = Statuspage.instance(this.config, this.logger);
    const state = syncMode === SyncMode.INCREMENTAL ? streamState : undefined;
    const cutoff: Date = state?.cutoff ? new Date(state?.cutoff) : undefined;

    yield* statuspage.getUsers(cutoff);
  }

  getUpdatedState(
    currentStreamState: UsersState,
    latestRecord: User
  ): UsersState {
    return {
      cutoff:
        new Date(latestRecord.updated_at) >
        new Date(currentStreamState?.cutoff ?? 0)
          ? latestRecord.updated_at
          : currentStreamState?.cutoff,
    };
  }
}
