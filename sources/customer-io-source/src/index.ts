import {AxiosInstance} from 'axios';
import {Command} from 'commander';
import {
  AirbyteLogger,
  AirbyteSourceBase,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {CustomerIO, CustomerIOConfig} from './customer-io/customer-io';
import {CampaignActions, Campaigns, Newsletters} from './streams';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new CustomerIOSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** Customer.io source implementation. */
export class CustomerIOSource extends AirbyteSourceBase<CustomerIOConfig> {
  get type(): string {
    return 'customerio';
  }

  constructor(logger: AirbyteLogger, private readonly axios?: AxiosInstance) {
    super(logger);
  }

  async spec(): Promise<AirbyteSpec> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return new AirbyteSpec(require('../resources/spec.json'));
  }

  async checkConnection(config: CustomerIOConfig): Promise<[boolean, VError]> {
    try {
      const customerIO = CustomerIO.instance(config, this.axios);
      await customerIO.checkConnection();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }

  streams(config: CustomerIOConfig): AirbyteStreamBase[] {
    return [
      new Campaigns(this.logger, config, this.axios),
      new CampaignActions(this.logger, config, this.axios),
      new Newsletters(this.logger, config, this.axios),
    ];
  }
}
