import {Command} from 'commander';
import path from 'path';

import {AirbyteLogger} from '../logger';
import {PACKAGE_VERSION, redactConfig} from '../utils';
import {AirbyteDestination} from './destination';

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
        this.logger.write(spec);
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
        this.logger.write(status);
      });
  }

  writeCommand(): Command {
    return new Command()
      .command('write')
      .description('write command')
      .alias('w')
      .requiredOption('--config <path to json>', 'config json')
      .requiredOption('--catalog <path to json>', 'catalog json')
      .option(
        '--dry-run',
        'dry run to skip writing records to destination',
        false
      )
      .action(
        async (opts: {config: string; catalog: string; dryRun: boolean}) => {
          const config = require(path.resolve(opts.config));
          const catalog = require(path.resolve(opts.catalog));
          const spec = await this.destination.spec();
          this.logger.info('config: ' + redactConfig(config, spec));
          this.logger.info('catalog: ' + JSON.stringify(catalog));
          this.logger.info('dryRun: ' + opts.dryRun);

          try {
            process.stdin.setEncoding('utf-8');

            const iter = this.destination.write(
              config,
              catalog,
              process.stdin,
              opts.dryRun
            );
            for await (const message of iter) {
              this.logger.write(message);
            }
          } catch (e: any) {
            this.logger.error(
              `Encountered an error while writing to destination: ${
                e.message ?? JSON.stringify(e)
              }`
            );
            throw e;
          } finally {
            process.stdin.destroy();
          }
        }
      );
  }
}
