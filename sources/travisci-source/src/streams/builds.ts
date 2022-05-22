import {AxiosInstance} from 'axios';
import {AirbyteLogger, AirbyteStreamBase, SyncMode} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {TravisCI, TravisCIConfig} from '../travisci/travisci';
import {Build} from '../travisci/typings';

interface BuildState {
  lastFinishedAt: string;
}
export class Builds extends AirbyteStreamBase {
  constructor(
    logger: AirbyteLogger,
    private readonly config: TravisCIConfig,
    private readonly axios?: AxiosInstance
  ) {
    super(logger);
  }
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/builds.json');
  }

  get primaryKey(): string {
    return 'id';
  }

  get cursorField(): string {
    return 'finished_at';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any, string>,
    streamState?: BuildState
  ): AsyncGenerator<Build, any, unknown> {
    const lastFinishedAt =
      syncMode === SyncMode.INCREMENTAL
        ? streamState?.lastFinishedAt
        : undefined;
    const travisCI = TravisCI.instance(this.config, this.axios);
    yield* travisCI.fetchBuilds(lastFinishedAt);
  }

  getUpdatedState(
    currentStreamState: BuildState,
    latestRecord: Build
  ): BuildState {
    const lastFinishedAt: Date = new Date(latestRecord.finished_at);
    return {
      lastFinishedAt:
        lastFinishedAt >= new Date(currentStreamState?.lastFinishedAt || 0)
          ? latestRecord.finished_at
          : currentStreamState.lastFinishedAt,
    };
  }
}
