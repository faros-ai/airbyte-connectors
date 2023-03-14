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
  [spaceName: string]: {lastReleaseId: string};
}

type StreamSlice = {spaceName: string};

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
    streamSlice?: StreamSlice,
    streamState?: ReleaseState
  ): AsyncGenerator<Release> {
    const octopus = await Octopus.instance(this.config, this.logger);
    const checkpoints =
      syncMode === SyncMode.INCREMENTAL ? streamState : undefined;
    yield* octopus.getReleases(checkpoints);
  }

  getUpdatedState(
    currentStreamState: ReleaseState,
    latestRecord: Release
  ): ReleaseState {
    const spaceName = latestRecord.SpaceName;
    const lastId = currentStreamState[spaceName]?.lastReleaseId;
    const currentIdNum = lastId ? +lastId.match(this.idNumRegex)[1] : 0;
    const latestIdNum = +latestRecord.Id.match(this.idNumRegex)[1];
    return currentIdNum < latestIdNum
      ? {...currentStreamState, [spaceName]: {lastReleaseId: latestRecord.Id}}
      : currentStreamState;
  }
}
