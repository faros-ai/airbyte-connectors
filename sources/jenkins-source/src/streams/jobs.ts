import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Jenkins, JenkinsConfig, Job} from '../jenkins';

export class JenkinsJobs extends AirbyteStreamBase {
  constructor(readonly config: JenkinsConfig, logger: AirbyteLogger) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../resources/schemas/jobs.json');
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
    streamSlice?: Job,
    streamState?: any
  ): AsyncGenerator<Job, any, any> {
    const jenkins = await Jenkins.make(this.config, this.logger);
    if (!jenkins) return;

    let jobs: Job[];
    if (syncMode === SyncMode.INCREMENTAL) {
      jobs = await jenkins.syncJobs(this.config, streamSlice || null);
    } else {
      jobs = await jenkins.syncJobs(this.config, null);
    }
    for (const job of jobs) {
      yield job;
    }
  }
}
