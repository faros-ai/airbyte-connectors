import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Asana, AsanaConfig} from '../asana';
import {Tag} from '../models';
import {StreamSlice} from './common';

export class Tags extends AirbyteStreamBase {
  constructor(
    private readonly config: AsanaConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/tags.json');
  }

  get primaryKey(): StreamKey {
    return 'gid';
  }

  async *streamSlices(): AsyncGenerator<StreamSlice> {
    const asana = Asana.instance(this.config, this.logger);

    for (const workspace of await asana.getWorkspaces()) {
      yield {workspace: workspace.gid};
    }
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: StreamSlice
  ): AsyncGenerator<Tag> {
    const asana = Asana.instance(this.config, this.logger);

    yield* asana.getTags(streamSlice.workspace, this.logger);
  }
}
