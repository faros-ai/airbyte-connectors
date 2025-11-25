import {Command} from 'commander';
import {
  AirbyteSourceBase,
  AirbyteSourceLogger,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {AzureTfvc} from './azure-tfvc';
import {AzureTfvcConfig} from './models';
import {Branches, Changesets, Projects} from './streams';

export function mainCommand(): Command {
  const logger = new AirbyteSourceLogger();
  const source = new AzureTfvcSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

export class AzureTfvcSource extends AirbyteSourceBase<AzureTfvcConfig> {
  get type(): string {
    return 'azure-tfvc';
  }

  async spec(): Promise<AirbyteSpec> {
    return new AirbyteSpec(require('../resources/spec.json'));
  }

  async checkConnection(config: AzureTfvcConfig): Promise<[boolean, VError]> {
    try {
      const tfvc = await AzureTfvc.instance(
        config,
        this.logger,
        config.include_changes ?? true
      );
      await tfvc.checkConnection(config.projects);
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }

  streams(config: AzureTfvcConfig): AirbyteStreamBase[] {
    return [
      new Projects(config, this.logger),
      new Changesets(config, this.logger),
      new Branches(config, this.logger),
    ];
  }
}
