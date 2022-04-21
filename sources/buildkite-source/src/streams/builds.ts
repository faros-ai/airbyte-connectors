import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Build, Buildkite, BuildkiteConfig} from '../buildkite/buildkite';

interface BuildState {
  lastCreatedAt?: string;
}

export class Builds extends AirbyteStreamBase {
  constructor(
    private readonly config: BuildkiteConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/builds.json');
  }
  get primaryKey(): StreamKey {
    return 'uuid';
  }
  get cursorField(): string | string[] {
    return ['createdAt'];
  }
  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any>,
    streamState?: BuildState
  ): AsyncGenerator<Build> {
    const lastCreatedAt =
      syncMode === SyncMode.INCREMENTAL && streamState?.lastCreatedAt
        ? new Date(streamState.lastCreatedAt)
        : undefined;

    const buildkite = Buildkite.instance(this.config, this.logger);
    yield* buildkite.getBuilds(undefined, lastCreatedAt);
  }
  getUpdatedState(
    currentStreamState: BuildState,
    latestRecord: Build
  ): BuildState {
    const lastCreatedAt = new Date(latestRecord.createdAt);
    return {
      lastCreatedAt:
        lastCreatedAt > new Date(currentStreamState?.lastCreatedAt || 0)
          ? latestRecord.createdAt
          : currentStreamState.lastCreatedAt,
    };
  }
}
