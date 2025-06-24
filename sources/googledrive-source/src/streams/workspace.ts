import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {WorkspaceCustomer} from 'faros-airbyte-common/googledrive';
import {Dictionary} from 'ts-essentials';

import {GoogleDrive, GoogleDriveConfig} from '../googledrive';

export class Workspace extends AirbyteStreamBase {
  constructor(
    readonly config: GoogleDriveConfig,
    logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/workspace.json');
  }

  get primaryKey(): StreamKey {
    return 'id';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any, string>,
    streamState?: Dictionary<any, string>
  ): AsyncGenerator<WorkspaceCustomer> {
    const googleDrive = await GoogleDrive.instance(this.config, this.logger);
    const workspaceCustomer = await googleDrive.getWorkspaceCustomer();
    yield workspaceCustomer;
  }
}
