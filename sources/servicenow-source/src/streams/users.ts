import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {User} from '../servicenow/models';
import {ServiceNow} from '../servicenow/servicenow';

export interface UsersState {
  sys_updated_on: string;
}

export class Users extends AirbyteStreamBase {
  constructor(
    private readonly servicenow: Promise<ServiceNow>,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/user.json');
  }
  get primaryKey(): StreamKey {
    return ['sys_id', 'value'];
  }
  get cursorField(): string | string[] {
    return ['sys_updated_on', 'value'];
  }
  getUpdatedState(
    currentStreamState: UsersState,
    latestRecord: User
  ): UsersState {
    const latestModifiedAt = currentStreamState?.sys_updated_on
      ? new Date(currentStreamState.sys_updated_on).getTime()
      : 0;
    const recordModifiedAt = latestRecord?.sys_updated_on
      ? new Date(latestRecord.sys_updated_on).getTime()
      : 0;
    return {
      sys_updated_on: new Date(
        Math.max(latestModifiedAt, recordModifiedAt)
      ).toISOString(),
    };
  }

  async *readRecords(
    syncMode: SyncMode,
    _cursorField?: string[],
    _streamSlice?: Dictionary<any, string>,
    streamState?: UsersState
  ): AsyncGenerator<Dictionary<any, string>, any, unknown> {
    const servicenow = await this.servicenow;
    const state = syncMode === SyncMode.INCREMENTAL ? streamState : undefined;
    yield* servicenow.getUsers(state?.sys_updated_on);
  }
}
