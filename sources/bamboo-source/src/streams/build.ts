import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';
import {DateTime} from 'luxon';
import {Dictionary} from 'ts-essentials';

import {Bamboo, BambooConfig, DEFAULT_BUILD_TIMEOUT, isNewer} from '../bamboo';
import {Build, BuildStatusCategory} from '../models';

interface BuildState {
  lastBuildStartedTime?: Date;
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
        ? streamState?.lastBuildStartedTime
        : undefined;
    const bamboo = await Bamboo.instance(this.config, this.logger);
    yield* bamboo.getBuilds(this.projectNames, lastUpdatedAt);
  }

  getUpdatedState(
    currentStreamState: BuildState,
    latestRecord: Build
  ): BuildState {
    const lastBuildStartedTime = Utils.toDate(
      currentStreamState.lastBuildStartedTime
    );

    const buildStartedTime = Utils.toDate(latestRecord.buildStartedTime);
    const buildStatus = this.convertBuildStatus(latestRecord.state);
    const runningStartedTime = isNewer(
      buildStatus.category,
      [
        BuildStatusCategory.Unknown,
        BuildStatusCategory.Running,
        BuildStatusCategory.Queued,
      ],
      this.config.buildTimeout ?? DEFAULT_BUILD_TIMEOUT,
      lastBuildStartedTime,
      buildStartedTime
    );
    return {
      lastBuildStartedTime:
        !lastBuildStartedTime || runningStartedTime
          ? buildStartedTime
          : currentStreamState.lastBuildStartedTime,
    };
  }

  convertBuildStatus(status: string | undefined): {
    category: BuildStatusCategory;
    detail: string;
  } {
    if (!status) {
      return {category: BuildStatusCategory.Custom, detail: 'undefined'};
    }
    const detail = status.toLowerCase();

    switch (detail) {
      case 'failed':
      case 'broken':
        return {category: BuildStatusCategory.Failed, detail};
      case 'successful':
      case 'fixed':
        return {category: BuildStatusCategory.Success, detail};
      case 'incomplete':
      case 'in_progress':
        return {category: BuildStatusCategory.Running, detail};
      case 'unknown':
        return {category: BuildStatusCategory.Unknown, detail};
      case 'pending':
        return {category: BuildStatusCategory.Queued, detail};
      default:
        return {category: BuildStatusCategory.Custom, detail};
    }
  }
}
