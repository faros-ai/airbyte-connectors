import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';
import {Dictionary} from 'ts-essentials';

import {Build, Buildkite, BuildkiteConfig} from '../buildkite/buildkite';

interface BuildState {
  lastCursor?: string;
  lastCreatedAt?: Date;
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
    return ['cursor', 'createdAt'];
  }
  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any>,
    streamState?: BuildState
  ): AsyncGenerator<Build> {
    const lastCursor =
      syncMode === SyncMode.INCREMENTAL ? streamState?.lastCursor : undefined;
    const lastCreatedAt =
      syncMode === SyncMode.INCREMENTAL
        ? streamState?.lastCreatedAt
        : undefined;
    const buildkite = Buildkite.instance(this.config, this.logger);
    yield* buildkite.getBuilds(lastCursor, lastCreatedAt);
  }
  getUpdatedState(
    currentStreamState: BuildState,
    latestRecord: Build
  ): BuildState {
    return {
      lastCursor: latestRecord.cursor,
      lastCreatedAt: Utils.toDate(latestRecord.createdAt),
    };
  }
}
