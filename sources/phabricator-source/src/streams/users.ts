import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Phabricator, PhabricatorConfig, User} from '../phabricator';

export interface UsersState {
  latestCreatedAt: number;
}

export class Users extends AirbyteStreamBase {
  constructor(
    private readonly config: PhabricatorConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/users.json');
  }
  get primaryKey(): StreamKey {
    throw 'phid';
  }
  get cursorField(): string[] {
    return ['fields', 'dateCreated'];
  }
  get stateCheckpointInterval(): number {
    return 5 * this.config.limit;
  }
  getUpdatedState(
    currentStreamState: UsersState,
    latestRecord: User
  ): UsersState {
    const latestCreated = currentStreamState?.latestCreatedAt ?? 0;
    const recordCreated = latestRecord.fields?.dateCreated ?? 0;
    currentStreamState.latestCreatedAt = Math.max(latestCreated, recordCreated);
    return currentStreamState;
  }
  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any>,
    streamState?: UsersState
  ): AsyncGenerator<User, any, any> {
    const phabricator = await Phabricator.make(this.config, this.logger);
    const state = syncMode === SyncMode.INCREMENTAL ? streamState : undefined;
    const createdAt = state?.latestCreatedAt ?? 0;

    yield* phabricator.getUsers({}, createdAt);
  }
}
