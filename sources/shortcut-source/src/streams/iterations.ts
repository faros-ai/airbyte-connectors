import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Iteration, Shortcut, ShortcutConfig} from '../shortcut';

interface IterationState {
  lastUpdatedAt: string;
}

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
    const lastUpdatedAt =
      syncMode === SyncMode.INCREMENTAL
        ? streamState?.lastUpdatedAt
        : undefined;
    const shortcut = await Shortcut.instance(this.config);
    for (const iteration of await shortcut.getIterations(lastUpdatedAt)) {
      yield iteration;
    }
  }

  getUpdatedState(
    currentStreamState: IterationState,
    latestRecord: Iteration
  ): IterationState {
    const lastUpdatedAt: Date = new Date(latestRecord.updated_at);
    return {
      lastUpdatedAt:
        lastUpdatedAt >= new Date(currentStreamState?.lastUpdatedAt || 0)
          ? latestRecord.updated_at
          : currentStreamState.lastUpdatedAt,
    };
  }
}
