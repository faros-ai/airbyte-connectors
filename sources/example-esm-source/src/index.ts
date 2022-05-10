import VError from '@openagenda/verror';
import {Command} from 'commander';
import {
  AirbyteConfig,
  AirbyteLogger,
  AirbyteSourceBase,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import fs from 'fs-extra';
import path from 'path';
import * as url from 'url';

import {Builds} from './streams/builds.js';

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new ExampleSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** Example source implementation. */
class ExampleSource extends AirbyteSourceBase {
  async spec(): Promise<AirbyteSpec> {
    return new AirbyteSpec(
      fs.readJSONSync(path.resolve(__dirname, '../resources/spec.json'))
    );
  }
  async checkConnection(config: AirbyteConfig): Promise<[boolean, VError]> {
    if (config.user === 'chris') {
      return [true, undefined];
    }
    return [false, new VError('User is not chris')];
  }
  streams(config: AirbyteConfig): AirbyteStreamBase[] {
    return [new Builds(this.logger)];
  }
}
