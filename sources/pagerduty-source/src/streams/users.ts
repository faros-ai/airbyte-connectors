import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Pagerduty, PagerdutyConfig, User} from '../pagerduty';

export class Users extends AirbyteStreamBase {
  constructor(readonly config: PagerdutyConfig, logger: AirbyteLogger) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/users.json');
  }
  get primaryKey(): StreamKey {
    return 'id';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: User,
    streamState?: Dictionary<any, string>
  ): AsyncGenerator<Dictionary<any, string>, any, unknown> {
    const pagerduty = Pagerduty.instance(this.config, this.logger);
    const state = syncMode === SyncMode.INCREMENTAL ? streamSlice : null;

    yield* pagerduty.getUsers(state, cursorField);
  }

  async *streamSlices(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: User
  ): AsyncGenerator<User | undefined> {
    let cursorValid = false;
    if (cursorField && streamSlice) {
      /** Check if streamSlice has all cursorFields.
       * First - create list of boolean values to define if fields exist
       * Second - List is checking to contain 'true' values
       */
      const fieldsExistingList = cursorField.map((f) => f in streamSlice);
      cursorValid = fieldsExistingList.findIndex((b) => !b) <= -1;
    }
    if (syncMode === SyncMode.INCREMENTAL && cursorValid) {
      yield streamSlice;
    } else {
      yield undefined;
    }
  }
}
