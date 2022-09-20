import {Command} from 'commander';
import path from 'path';

import {wrapApiError} from '../errors';
import {AirbyteLogger} from '../logger';
import {AirbyteConfig, AirbyteState} from '../protocol';
import {Runner} from '../runner';
import {PACKAGE_VERSION, redactConfig} from '../utils';
import {AirbyteSource} from './source';

export class AirbyteSourceRunner<Config extends AirbyteConfig> extends Runner {
  constructor(
    protected readonly logger: AirbyteLogger,
    protected readonly source: AirbyteSource<Config>
  ) {
    super(logger);
  }

  mainCommand(): Command {
    return new Command()
      .name('main')
      .version('v' + PACKAGE_VERSION)
      .addCommand(this.specCommand())
      .addCommand(this.checkCommand())
      .addCommand(this.discoverCommand())
      .addCommand(this.readCommand());
  }

  specCommand(): Command {
    return new Command()
      .command('spec')
      .description('spec command')
      .alias('s')
      .action(async () => {
        const spec = await this.source.spec();

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
        const status = await this.source.check(config);

        // Expected output
        this.logger.write(status);
      });
  }

  discoverCommand(): Command {
    return new Command()
      .command('discover')
      .description('discover command')
      .alias('d')
      .requiredOption('--config <path to json>', 'config json')
      .action(async (opts: {config: string}) => {
        const config = require(path.resolve(opts.config));
        const catalog = await this.source.discover(config);

        // Expected output
        this.logger.write(catalog);
      });
  }

  readCommand(): Command {
    return new Command()
      .command('read')
      .description('read command')
      .alias('r')
      .requiredOption('--config <path to json>', 'config json')
      .requiredOption('--catalog <path to json>', 'catalog json')
      .option('--state <path to json>', 'state json')
      .action(
        async (opts: {config: string; catalog: string; state?: string}) => {
          const config = require(path.resolve(opts.config));
          const catalog = require(path.resolve(opts.catalog));
          const spec = await this.source.spec();
          this.logger.info('config: ' + redactConfig(config, spec));
          this.logger.info('catalog: ' + JSON.stringify(catalog));

          let state: AirbyteState | undefined = undefined;
          if (opts.state) {
            state = require(path.resolve(opts.state));
            this.logger.info('state: ' + JSON.stringify(state));
          }

          try {
            const iter = this.source.read(config, catalog, state);
            for await (const message of iter) {
              this.logger.write(message);
            }
          } catch (e: any) {
            const w = wrapApiError(e);
            const s = JSON.stringify(w);
            this.logger.error(
              `Encountered an error while reading from source: ${w} - ${s}`
            );
            throw e;
          }
        }
      );
  }
}
