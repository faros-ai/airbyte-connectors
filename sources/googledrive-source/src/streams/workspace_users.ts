import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {WorkspaceUser} from 'faros-airbyte-common/googledrive';
import {Dictionary} from 'ts-essentials';

import {GoogleDrive, GoogleDriveConfig} from '../googledrive';

export class WorkspaceUsers extends AirbyteStreamBase {
  constructor(
    readonly config: GoogleDriveConfig,
    logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/workspaceUsers.json');
  }

  get primaryKey(): StreamKey {
    return 'id';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any, string>,
    streamState?: Dictionary<any, string>
  ): AsyncGenerator<WorkspaceUser> {
    const googleDrive = await GoogleDrive.instance(this.config, this.logger);
    const workspaceUsers = await googleDrive.queryWorkspaceUsers();
    yield* workspaceUsers;
  }
}
