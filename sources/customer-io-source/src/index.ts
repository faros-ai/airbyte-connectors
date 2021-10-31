import Axios, {AxiosError} from 'axios';
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

import {genAuthorizationHeader} from './gen-authorization-header';
import {CampaignActions, Campaigns} from './streams';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new CustomerIOSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** Customer.io source implementation. */
export class CustomerIOSource extends AirbyteSourceBase {
  readonly axios = Axios.create({
    baseURL: 'https://beta-api.customer.io/v1/api',
    timeout: 30000,
    responseType: 'json',
  });

  async spec(): Promise<AirbyteSpec> {
    return new AirbyteSpec(require('../resources/spec.json'));
  }

  async checkConnection(config: AirbyteConfig): Promise<[boolean, VError]> {
    try {
      await this.axios.get('/campaigns', {
        headers: genAuthorizationHeader(config),
      });
      return [true, undefined];
    } catch (error) {
      if (
        (error as AxiosError).response &&
        (error as AxiosError).response.status === 401
      ) {
        return [
          false,
          new VError(
            'Customer.io authorization failed. Try changing your app api token'
          ),
        ];
      }

      return [
        false,
        new VError(
          `Customer.io api request failed: ${(error as Error).message}`
        ),
      ];
    }
  }

  streams(config: AirbyteConfig): AirbyteStreamBase[] {
    return [
      new Campaigns(this.logger, this.axios, config),
      new CampaignActions(this.logger, this.axios, config),
    ];
  }
}
