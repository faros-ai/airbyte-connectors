import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';
import {Dictionary} from 'ts-essentials';

import {Bamboo, BambooConfig} from '../bamboo';
import {Build} from '../models';

interface BuildState {
  lastBuildStartedTime: string;
}

export class Builds extends AirbyteStreamBase {
  constructor(
    private readonly config: BambooConfig,
    protected readonly logger: AirbyteLogger,
    protected readonly projectNames?: [string]
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/builds.json');
  }

  get primaryKey(): StreamKey {
    return 'id';
  }

  get cursorField(): string | string[] {
    return 'buildStartedTime';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any>,
    streamState?: BuildState
  ): AsyncGenerator<Build, any, unknown> {
    const lastUpdatedAt =
      syncMode === SyncMode.INCREMENTAL
        ? Utils.toDate(streamState?.lastBuildStartedTime)
        : undefined;
    const bamboo = await Bamboo.instance(this.config, this.logger);
    yield* bamboo.getBuilds(this.projectNames, lastUpdatedAt);
  }

  getUpdatedState(
    currentStreamState: BuildState,
    latestRecord: Build
  ): BuildState {
    const lastBuildStartedTime: Date = new Date(latestRecord.buildStartedTime);
    return {
      lastBuildStartedTime:
        lastBuildStartedTime >=
        new Date(currentStreamState?.lastBuildStartedTime || 0)
          ? latestRecord.buildStartedTime
          : currentStreamState.lastBuildStartedTime,
    };
  }
}
