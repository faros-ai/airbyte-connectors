import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Asana, AsanaConfig} from '../asana';
import {Workspace} from '../models';
import {StreamSlice} from './common';

export class Workspaces extends AirbyteStreamBase {
  constructor(
    private readonly config: AsanaConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/workspaces.json');
  }

  get primaryKey(): StreamKey {
    return 'gid';
  }

  async *readRecords(): AsyncGenerator<Workspace> {
    const asana = Asana.instance(this.config, this.logger);

    for (const workspace of await asana.getWorkspaces()) {
      yield workspace;
    }
  }
}
