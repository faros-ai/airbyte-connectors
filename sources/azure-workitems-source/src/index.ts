import {Command} from 'commander';
import {
  AirbyteSourceBase,
  AirbyteSourceLogger,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {AzureWorkitems} from './azure-workitems';
import {Iterations, Projects, Users, Workitems} from './streams';
import {AzureWorkitemsConfig} from './types';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteSourceLogger();
  const source = new AzureWorkitemsSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** Example source implementation. */
export class AzureWorkitemsSource extends AirbyteSourceBase<AzureWorkitemsConfig> {
  get type(): string {
    return 'azure-workitems';
  }

  async spec(): Promise<AirbyteSpec> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return new AirbyteSpec(require('../resources/spec.json'));
  }

  async checkConnection(
    config: AzureWorkitemsConfig
  ): Promise<[boolean, VError]> {
    try {
      const azureWorkItems = await AzureWorkitems.instance(
        config,
        this.logger,
        config.additional_fields,
        config.fetch_work_item_comments,
        config.fetch_code_reviews
      );
      await azureWorkItems.checkConnection(config.projects);
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }

  streams(config: AzureWorkitemsConfig): AirbyteStreamBase[] {
    return [
      new Projects(config, this.logger),
      new Workitems(config, this.logger),
      new Users(config, this.logger),
      new Iterations(config, this.logger),
    ];
  }
}
