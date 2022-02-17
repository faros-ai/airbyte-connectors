import {Command} from 'commander';
import {
  AirbyteLogger,
  AirbyteSourceBase,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {AzureGit, AzureGitConfig} from './azuregit';
import {Repositories} from './streams';
/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new AzureGitSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** AzureGit source implementation. */
export class AzureGitSource extends AirbyteSourceBase {
  async spec(): Promise<AirbyteSpec> {
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  async checkConnection(config: AzureGitConfig): Promise<[boolean, VError]> {
    try {
      const azureActiveDirectory = await AzureGit.instance(config, this.logger);
      await azureActiveDirectory.checkConnection();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }
  streams(config: AzureGitConfig): AirbyteStreamBase[] {
    return [new Repositories(config, this.logger)];
  }
}
