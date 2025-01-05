import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Jenkins, JenkinsConfig, Job} from '../jenkins';

export class Jobs extends AirbyteStreamBase {
  constructor(
    readonly config: JenkinsConfig,
    logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/jobs.json');
  }
  get primaryKey(): StreamKey {
    return 'fullName';
  }
  get cursorField(): string | string[] {
    return ['url'];
  }
  async *streamSlices(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Job
  ): AsyncGenerator<Job | undefined> {
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

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Job
  ): AsyncGenerator<Job, any, any> {
    const jenkins = Jenkins.instance(this.config, this.logger);
    const state =
      syncMode === SyncMode.INCREMENTAL ? streamSlice || null : null;

    for (const job of await jenkins.syncJobs(this.config, state)) {
      yield job;
    }
  }
}
