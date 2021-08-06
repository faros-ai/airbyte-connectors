import {Command} from 'commander';
import path from 'path';
import readline from 'readline';

import {AirbyteDestination} from './destination';
import {AirbyteLogger} from './logger';
import {PACKAGE_VERSION} from './utils';

export class AirbyteDestinationRunner {
  constructor(
    private readonly logger: AirbyteLogger,
    private readonly destination: AirbyteDestination
  ) {}

  mainCommand(): Command {
    return new Command()
      .name('main')
      .version('v' + PACKAGE_VERSION)
      .addCommand(this.specCommand())
      .addCommand(this.checkCommand())
      .addCommand(this.discoverCommand())
      .addCommand(this.writeCommand());
  }

  specCommand(): Command {
    return new Command()
      .command('spec')
      .description('spec command')
      .alias('s')
      .action(async () => {
        const spec = await this.destination.spec();

        // Expected output
        this.logger.writeSpec(spec);
      });
  }

  checkCommand(): Command {
    return new Command()
      .command('check')
      .description('check command')
      .alias('c')
      .requiredOption('--config <path to json>', 'config json')
      .action(async (opts: {config: string}) => {
        const config = require(path.resolve(opts.config));
        const status = await this.destination.check(config);

        // Expected output
        this.logger.writeConnectionStatus(status);
      });
  }

  discoverCommand(): Command {
    return new Command()
      .command('discover')
      .description('discover command')
      .alias('d')
      .requiredOption('--config <path to json>', 'config json')
      .action(async () => {
        const catalog = this.destination.discover();

        // Expected output
        this.logger.writeCatalog(catalog);
      });
  }

  writeCommand(): Command {
    return new Command()
      .command('write')
      .description('write command')
      .alias('w')
      .requiredOption('--config <path to json>', 'config json')
      .requiredOption('--catalog <path to json>', 'catalog json')
      .action(
        async (opts: {config: string; catalog: string; state?: string}) => {
          const config = require(path.resolve(opts.config));
          const catalog = require(path.resolve(opts.catalog));
          this.logger.info('config: ' + JSON.stringify(config));
          this.logger.info('catalog: ' + JSON.stringify(catalog));

          process.stdin.setEncoding('utf-8');
          const input = readline.createInterface({
            input: process.stdin,
            terminal: process.stdin.isTTY,
          });

          const newState = await this.destination.write(config, catalog, input);

          // Write state for next sync
          this.logger.writeState(newState);
        }
      );
  }
}
