import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Clubhouse, ClubhouseConfig, Story} from '../clubhouse';

export class Stories extends AirbyteStreamBase {
  constructor(
    private readonly config: ClubhouseConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/stories.json');
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
    streamState?: Dictionary<any>
  ): AsyncGenerator<Story> {
    syncMode === SyncMode.INCREMENTAL ? streamState?.lastUpdatedAt : undefined;
    const clubhouse = await Clubhouse.instance(this.config);
    yield* clubhouse.getStories();
  }
}
