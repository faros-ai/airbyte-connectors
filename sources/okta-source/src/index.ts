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

import {OktaConfig} from './okta';
import {Users} from './streams';
/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new OktaSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** Okta source implementation. */
class OktaSource extends AirbyteSourceBase {
  async spec(): Promise<AirbyteSpec> {
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  async checkConnection(config: AirbyteConfig): Promise<[boolean, VError]> {
    if (config.user === 'chris') {
      return [true, undefined];
    }
    return [false, new VError('User is not chris')];
  }
  streams(config: OktaConfig): AirbyteStreamBase[] {
    return [new Users(config, this.logger)];
  }
}
