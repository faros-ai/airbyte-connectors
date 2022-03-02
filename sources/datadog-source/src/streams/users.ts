import {v2} from '@datadog/datadog-api-client';
import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Datadog} from '../datadog';

export interface UsersState {
  lastModifiedAt: Date;
}

export class Users extends AirbyteStreamBase {
  constructor(
    private readonly datadog: Datadog,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/user.json');
  }
  get primaryKey(): StreamKey {
    return ['id'];
  }
  get cursorField(): string | string[] {
    return ['modifiedAt'];
  }
  getUpdatedState(
    currentStreamState: UsersState,
    latestRecord: v2.User
  ): UsersState {
    const latestModifiedAt = currentStreamState?.lastModifiedAt
      ? new Date(currentStreamState.lastModifiedAt).getTime()
      : 0;
    const recordModifiedAt = latestRecord?.attributes?.modifiedAt
      ? new Date(latestRecord.attributes.modifiedAt).getTime()
      : 0;
    return {
      lastModifiedAt: new Date(Math.max(latestModifiedAt, recordModifiedAt)),
    };
  }

  async *readRecords(
    syncMode: SyncMode,
    _cursorField?: string[],
    _streamSlice?: Dictionary<any, string>,
    streamState?: UsersState
  ): AsyncGenerator<Dictionary<any, string>, any, unknown> {
    const state = syncMode === SyncMode.INCREMENTAL ? streamState : undefined;
    yield* this.datadog.getUsers(state?.lastModifiedAt);
  }
}
