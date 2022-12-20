import {Command} from 'commander';
import {
  AirbyteConfig,
  AirbyteLogger,
  AirbyteSourceBase,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {AzureWorkitems, AzureWorkitemsConfig} from './azure-workitems';
import { Workitems } from './streams/workitems';

interface SourceConfig extends AirbyteConfig {
  readonly user: string;
}

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new AzureWorkitemsSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** Example source implementation. */
export class AzureWorkitemsSource extends AirbyteSourceBase<AzureWorkitemsConfig> {
  async spec(): Promise<AirbyteSpec> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  async checkConnection(config: AzureWorkitemsConfig): Promise<[boolean, VError]> {
    try {
      const azureActiveDirectory = await AzureWorkitems.instance(config);
      await azureActiveDirectory.checkConnection();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }
  streams(config: AzureWorkitemsConfig): AirbyteStreamBase[] {
    return [new Workitems(config, this.logger)];
  }
}
