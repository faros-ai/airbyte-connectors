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
  AzureActiveDirectory,
  AzureActiveDirectoryConfig,
} from './azureactivedirectory';
import {Groups, Users} from './streams';
/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteSourceLogger();
  const source = new AzureActiveDirectorySource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** AzureActiveDirectory source implementation. */
export class AzureActiveDirectorySource extends AirbyteSourceBase<AzureActiveDirectoryConfig> {
  get type(): string {
    return 'azure-activedirectory';
  }

  async spec(): Promise<AirbyteSpec> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  async checkConnection(
    config: AzureActiveDirectoryConfig
  ): Promise<[boolean, VError]> {
    try {
      const azureActiveDirectory = await AzureActiveDirectory.instance(
        config,
        this.logger
      );
      await azureActiveDirectory.checkConnection();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }
  streams(config: AzureActiveDirectoryConfig): AirbyteStreamBase[] {
    return [new Users(config, this.logger), new Groups(config, this.logger)];
  }
}
