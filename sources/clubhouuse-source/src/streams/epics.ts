import {Epic} from 'clubhouse-lib';
import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Clubhouse, ClubhouseConfig} from '../clubhouse';
export class Epics extends AirbyteStreamBase {
  constructor(
    private readonly config: ClubhouseConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/epics.json');
  }
  get primaryKey(): StreamKey {
    return ['id'];
  }
  get cursorField(): string | string[] {
    return 'updated_at';
  }
  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any>,
    streamState?: Dictionary<any>,
    rojectIds?: ReadonlyArray<number>
  ): AsyncGenerator<Epic> {
    syncMode === SyncMode.INCREMENTAL ? streamState?.lastUpdatedAt : undefined;
    const clubhouse = await Clubhouse.instance(this.config);
    yield* clubhouse.getEpics(rojectIds);
  }
}
