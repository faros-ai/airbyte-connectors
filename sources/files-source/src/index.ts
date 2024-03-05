import {Command} from 'commander';
import {
  AirbyteLogger,
  AirbyteSourceBase,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {FilesConfig, FilesReader} from './files-reader';
import {Files} from './streams';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new FilesSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

export class FilesSource extends AirbyteSourceBase<FilesConfig> {
  async spec(): Promise<AirbyteSpec> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return new AirbyteSpec(require('../resources/spec.json'));
  }

  async checkConnection(config: FilesConfig): Promise<[boolean, VError]> {
    try {
      const filesReader = await FilesReader.instance(config, this.logger);
      await filesReader.checkConnection();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }

  streams(config: FilesConfig): AirbyteStreamBase[] {
    return [new Files(config, this.logger)];
  }
}
