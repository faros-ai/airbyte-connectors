import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {
  Build,
  DEFAULT_PAGE_SIZE,
  Jenkins,
  JenkinsConfig,
  JenkinsState,
} from '../jenkins';

export class Builds extends AirbyteStreamBase {
  constructor(readonly config: JenkinsConfig, logger: AirbyteLogger) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/builds.json');
  }
  get primaryKey(): StreamKey {
    return 'fullDisplayName';
  }
  get cursorField(): string | string[] {
    return 'number';
  }
  get stateCheckpointInterval(): number {
    return 10 * (this.config.pageSize ?? DEFAULT_PAGE_SIZE);
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Build,
    streamState?: JenkinsState
  ): AsyncGenerator<Build, any, any> {
    const jenkins = await Jenkins.make(this.config, this.logger);
    if (!jenkins) return;

    let iter: AsyncGenerator<Build, any, unknown>;
    if (syncMode === SyncMode.INCREMENTAL) {
      iter = jenkins.syncBuilds(this.config, streamState ?? null);
    } else {
      iter = jenkins.syncBuilds(this.config, null);
    }
    yield* iter;
  }

  getUpdatedState(
    currentStreamState: JenkinsState,
    latestRecord: Build
  ): JenkinsState {
    const jobName = Builds.buildNameToJob(latestRecord.fullDisplayName);
    if (!currentStreamState.newJobsLastCompletedBuilds) {
      currentStreamState.newJobsLastCompletedBuilds = {};
    }
    currentStreamState.newJobsLastCompletedBuilds[jobName] = Math.max(
      currentStreamState?.newJobsLastCompletedBuilds[jobName] ?? 0,
      latestRecord?.number ?? 0
    );
    return currentStreamState;
  }

  static buildNameToJob(str: string): string {
    return str.substring(0, str.indexOf(' '));
  }
}
