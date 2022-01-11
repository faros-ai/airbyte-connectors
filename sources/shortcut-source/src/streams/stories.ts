import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {ExtendStory, Shortcut, ShortcutConfig} from '../shortcut';

export class Stories extends AirbyteStreamBase {
  constructor(
    private readonly config: ShortcutConfig,
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
  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any>,
    streamState?: Dictionary<any>,
    updateRange?: [Date, Date]
  ): AsyncGenerator<ExtendStory> {
    const shortcut = await Shortcut.instance(this.config);
    yield* shortcut.getStories(updateRange);
  }
}
