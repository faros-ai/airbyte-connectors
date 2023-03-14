import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Release} from '../models';
import {Octopus, OctopusConfig} from '../octopus';

interface ReleaseState {
  lastReleaseId: string;
}

export class Releases extends AirbyteStreamBase {
  idNumRegex = new RegExp(/^Releases-(.*)$/);

  constructor(
    private readonly config: OctopusConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/releases.json');
  }
  get primaryKey(): StreamKey {
    return 'Id';
  }
  get cursorField(): string | string[] {
    return 'Id';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: any,
    streamState?: ReleaseState
  ): AsyncGenerator<Release> {
    const octopus = await Octopus.instance(this.config, this.logger);
    const since =
      syncMode === SyncMode.INCREMENTAL
        ? streamState?.lastReleaseId
        : undefined;
    yield* octopus.getReleases(since);
  }

  getUpdatedState(
    currentStreamState: ReleaseState,
    latestRecord: Release
  ): ReleaseState {
    const currentIdNum = currentStreamState.lastReleaseId
      ? +currentStreamState.lastReleaseId.match(this.idNumRegex)[1]
      : 0;
    const latestIdNum = +latestRecord.Id.match(this.idNumRegex)[1];
    return currentIdNum >= latestIdNum
      ? currentStreamState
      : {lastReleaseId: latestRecord.Id};
  }
}
