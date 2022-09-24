import {Command} from 'commander';
import {
  AirbyteLogger,
  AirbyteSourceBase,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
  fileJson,
} from 'faros-airbyte-cdk';
import path from 'path';
import VError from 'verror';

import {Okta, OktaConfig} from './okta';
import {Groups, Users} from './streams';
/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new OktaSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** Okta source implementation. */
export class OktaSource extends AirbyteSourceBase<OktaConfig> {
  async spec(): Promise<AirbyteSpec> {
    return new AirbyteSpec(
      fileJson(path.resolve(__dirname, '../resources/spec.json'))
    );
  }
  async checkConnection(config: OktaConfig): Promise<[boolean, VError]> {
    try {
      const okta = await Okta.instance(config, this.logger);
      await okta.checkConnection();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }
  streams(config: OktaConfig): AirbyteStreamBase[] {
    return [new Users(config, this.logger), new Groups(config, this.logger)];
  }
}
