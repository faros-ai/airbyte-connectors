import {Command} from 'commander';
import {
  AirbyteSourceBase,
  AirbyteSourceLogger,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {SheetsConfig, SheetsReader} from './sheets-reader';
import {Sheets} from './streams';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteSourceLogger();
  const source = new SheetsSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

export class SheetsSource extends AirbyteSourceBase<SheetsConfig> {
  get type(): string {
    return 'sheets';
  }

  async spec(): Promise<AirbyteSpec> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return new AirbyteSpec(require('../resources/spec.json'));
  }

  async checkConnection(config: SheetsConfig): Promise<[boolean, VError]> {
    try {
      await SheetsReader.instance(config, this.logger);
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }

  streams(config: SheetsConfig): AirbyteStreamBase[] {
    return [new Sheets(config, this.logger)];
  }
}
