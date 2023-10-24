import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Asana, AsanaConfig} from '../asana';
import {Task} from '../models';
import {StreamSlice} from './common';

export class Projects extends AirbyteStreamBase {
  constructor(
    private readonly config: AsanaConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/projects.json');
  }

  get primaryKey(): StreamKey {
    return 'gid';
  }

  async *streamSlices(): AsyncGenerator<StreamSlice> {
    const asana = Asana.instance(this.config);

    for (const workspace of await asana.getWorkspaces()) {
      yield {workspace: workspace.gid};
    }
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: StreamSlice
  ): AsyncGenerator<Task> {
    const asana = Asana.instance(this.config);

    yield* asana.getProjects(streamSlice.workspace, this.logger);
  }
}
