import {Command} from 'commander';
import {
  AirbyteSourceBase,
  AirbyteSourceLogger,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {GoogleDrive, GoogleDriveConfig, REQUIRED_SCOPES} from './googledrive';
import {Activity} from './streams/activity';
import {Workspace} from './streams/workspace';
import {WorkspaceUsers} from './streams/workspace_users';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteSourceLogger();
  const source = new GoogleDriveSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** Google Drive source implementation. */
export class GoogleDriveSource extends AirbyteSourceBase<GoogleDriveConfig> {
  get type(): string {
    return 'googledrive';
  }

  async spec(): Promise<AirbyteSpec> {
    return new AirbyteSpec(require('../resources/spec.json'));
  }

  async checkConnection(config: GoogleDriveConfig): Promise<[boolean, VError]> {
    try {
      const googleDrive = await GoogleDrive.instance(config, this.logger);
      await googleDrive.checkConnection();
    } catch (error: any) {
      const err = new VError(
        `Please verify your private_key and client_email are correct and have access ` +
          `to these scopes: ${REQUIRED_SCOPES.join(',')} ` +
          `Error: ${error?.message}`
      );
      return [false, err];
    }

    return [true, undefined];
  }

  streams(config: GoogleDriveConfig): AirbyteStreamBase[] {
    return [
      new Activity(config, this.logger),
      new WorkspaceUsers(config, this.logger),
      new Workspace(config, this.logger),
    ];
  }
}
