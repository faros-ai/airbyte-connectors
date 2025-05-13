import {Command} from 'commander';
import {
  AirbyteSourceBase,
  AirbyteSourceLogger,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {
  GoogleDriveActivity,
  GoogleDriveActivityConfig,
} from './googledriveactivity';
import {ActivityStream} from './streams';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteSourceLogger();
  const source = new GoogleDriveActivitySource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** GoogleDriveActivity source implementation. */
export class GoogleDriveActivitySource extends AirbyteSourceBase<GoogleDriveActivityConfig> {
  get type(): string {
    return 'googledrive-activity';
  }

  async spec(): Promise<AirbyteSpec> {
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  
  async checkConnection(
    config: GoogleDriveActivityConfig
  ): Promise<[boolean, VError]> {
    try {
      const googleDriveActivity = await GoogleDriveActivity.instance(
        config,
        this.logger
      );
      
      const activities = googleDriveActivity.queryActivities('time');
      await activities.next();
      
    } catch (error: any) {
      const err = new VError(
        `Please verify your private_key and client_email are correct and have access to Drive Activity API. ` +
          `Error: ${error?.message}`
      );
      return [false, err];
    }

    return [true, undefined];
  }
  
  streams(config: GoogleDriveActivityConfig): AirbyteStreamBase[] {
    return [
      new ActivityStream(config, this.logger),
    ];
  }
}
