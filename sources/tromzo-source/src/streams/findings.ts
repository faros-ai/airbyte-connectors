import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Tromzo} from '../tromzo';
import {Finding, TromzoConfig} from '../types';

export class Findings extends AirbyteStreamBase {
  constructor(
    private readonly config: TromzoConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/findings.json');
  }

  get primaryKey(): StreamKey {
    return 'id';
  }

  get cursorField(): string | string[] {
    return 'updated_at';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any>,
    streamState?: Dictionary<any>
  ): AsyncGenerator<Finding> {
    const tromzo = await Tromzo.instance(this.config, this.logger);

    // TODO: Add state and incremental sync
    yield* tromzo.findings();
  }
}
