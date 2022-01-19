import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Backlog, BacklogConfig} from '../backlog';

export class Issues extends AirbyteStreamBase {
  constructor(
    private readonly config: BacklogConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/issues.json');
  }

  get primaryKey(): StreamKey {
    return ['id', 'source'];
  }

  get cursorField(): string | string[] {
    return 'updated';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any>
  ): AsyncGenerator<Dictionary<any, string>, any, unknown> {
    const backlog = await Backlog.instance(this.config, this.logger);
    yield* backlog.getIssues();
  }
}
