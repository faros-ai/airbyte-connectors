import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Tromzo} from '../tromzo';
import {Finding, TromzoConfig} from '../types';

type StreamSlice = {
  tool: string;
};

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

  async *streamSlices(): AsyncGenerator<StreamSlice> {
    for (const tool of this.config.tools ?? []) {
      yield {tool};
    }
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: StreamSlice,
    streamState?: Dictionary<any>
  ): AsyncGenerator<Finding> {
    const tromzo = await Tromzo.instance(this.config, this.logger);

    // TODO: Add incremental sync
    for await (const finding of tromzo.findings(streamSlice.tool)) {
      yield finding;
    }
  }
}
