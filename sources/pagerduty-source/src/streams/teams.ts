import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Pagerduty, PagerdutyConfig, Team} from '../pagerduty';

export class Teams extends AirbyteStreamBase {
  constructor(readonly config: PagerdutyConfig, logger: AirbyteLogger) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/teams.json');
  }
  get primaryKey(): StreamKey {
    return 'id';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Team,
    streamState?: Dictionary<any, string>
  ): AsyncGenerator<Dictionary<any, string>, any, unknown> {
    const pagerduty = Pagerduty.instance(this.config, this.logger);
    const state = syncMode === SyncMode.INCREMENTAL ? streamSlice : null;

    yield* pagerduty.getTeams(state, cursorField);
  }

  async *streamSlices(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Team
  ): AsyncGenerator<Team | undefined> {
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
