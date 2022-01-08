import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Epic, Shortcut, ShortcutConfig} from '../shortcut';

type StreamSlice = {projectId: number} | undefined;

export class Epics extends AirbyteStreamBase {
  constructor(
    private readonly config: ShortcutConfig,
    protected readonly logger: AirbyteLogger,
    protected readonly projectIds?: ReadonlyArray<number>
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

  async *streamSlices(
    syncMode: SyncMode,
    cursorField?: string[],
    streamState?: Dictionary<any>
  ): AsyncGenerator<StreamSlice> {
    for (const projectId of this.projectIds) {
      yield {projectId};
    }
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any>,
    streamState?: Dictionary<any>
  ): AsyncGenerator<Epic> {
    const shortcut = await Shortcut.instance(this.config);
    yield* shortcut.getEpics(this.projectIds);
  }
}
