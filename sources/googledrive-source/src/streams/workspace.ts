import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {
  GoogleDrive,
  GoogleDriveConfig,
  WorkspaceCustomer,
} from '../googledrive';

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

    this.logger.info(
      `Reading Workspace customer record with sync mode ${syncMode}`
    );

    const workspaceCustomer = await googleDrive.getWorkspaceCustomer();
    yield workspaceCustomer;
  }
}
