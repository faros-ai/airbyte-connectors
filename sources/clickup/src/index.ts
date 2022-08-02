import {Command} from 'commander';
import fetch from 'cross-fetch';
import {
  AirbyteConfig,
  AirbyteLogger,
  AirbyteSourceBase,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {Tasks} from './streams';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new NewSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** Example source implementation. */
class NewSource extends AirbyteSourceBase {
  async spec(): Promise<AirbyteSpec> {
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  async checkConnection(config: AirbyteConfig): Promise<[boolean, VError]> {
    const res = await fetch(
      'https://api.clickup.com/api/v2/list/34192283/task',
      {
        method: 'get',
        headers: {
          Authorization: config.personal_token,
          'Content-Type': 'application/json',
        },
      }
    );
    if (res.ok) {
      return [true, undefined];
    }
    return [false, new VError('Error in api call')];
  }
  streams(config: AirbyteConfig): AirbyteStreamBase[] {
    return [new Tasks(config, this.logger)];
  }
}
