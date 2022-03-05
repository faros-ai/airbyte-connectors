import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Buildkite, BuildkiteConfig, Job} from '../buildkite/buildkite';
interface JobState {
  lastCursor?: string;
}
export class Jobs extends AirbyteStreamBase {
  constructor(
    private readonly config: BuildkiteConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/jobs.json');
  }
  get primaryKey(): StreamKey {
    return 'uuid';
  }
  get cursorField(): string | string[] {
    return 'cursor';
  }
  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any>,
    streamState?: JobState
  ): AsyncGenerator<Job> {
    const lastCursor =
      syncMode === SyncMode.INCREMENTAL ? streamState?.lastCursor : undefined;
    const buildkite = Buildkite.instance(this.config, this.logger);
    yield* buildkite.getJobs(lastCursor);
  }

  getUpdatedState(currentStreamState: JobState, latestRecord: Job): JobState {
    return {
      lastCursor: latestRecord.cursor,
    };
  }
}
