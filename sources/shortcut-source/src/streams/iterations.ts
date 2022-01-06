import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Iteration,Shortcut, ShortcutConfig} from '../shortcut';
export class Iterations extends AirbyteStreamBase {
  constructor(
    private readonly config: ShortcutConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/iterations.json');
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
  ): AsyncGenerator<Iteration> {
    syncMode === SyncMode.INCREMENTAL ? streamState?.lastUpdatedAt : undefined;
    const shortcut = await Shortcut.instance(this.config);
    yield* shortcut.getIterations();
  }
}
