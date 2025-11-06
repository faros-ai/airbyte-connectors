/* eslint-disable @typescript-eslint/no-var-requires */

import {Command} from 'commander';
import fs from 'fs';
import {cloneDeep} from 'lodash';
import path from 'path';

import {wrapApiError} from '../errors';
import {buildArgs, buildJson, helpTable, traverseObject} from '../help';
import {
  AirbyteConfig,
  AirbyteConnectionStatus,
  AirbyteConnectionStatusMessage,
  AirbyteState,
} from '../protocol';
import {ConnectorVersion, Runner} from '../runner';
import {
  addSourceCommonProperties,
  Data,
  PACKAGE_VERSION,
  redactConfig,
} from '../utils';
import {AirbyteSource} from './source';
import {maybeCompressState} from './source-base';
import {AirbyteSourceLogger} from './source-logger';

export class AirbyteSourceRunner<Config extends AirbyteConfig> extends Runner {
  constructor(
    protected readonly logger: AirbyteSourceLogger,
    protected readonly source: AirbyteSource<Config>
  ) {
    super(logger);
  }

  mainCommand(): Command {
    return new Command()
      .name('main')
      .version('v' + PACKAGE_VERSION)
      .addCommand(this.specCommand())
      .addCommand(this.specPrettyCommand())
      .addCommand(this.airbyteLocalCLIWizardCommand())
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
        const spec = addSourceCommonProperties(await this.source.spec());

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

        // Skip check if check_connection is explicitly set to false
        if (config.check_connection === false) {
          this.logger.info(
            'Skipping setup-time connection check (check_connection=false). ' +
              'Connection will be validated before reading data.'
          );
          const status = new AirbyteConnectionStatusMessage({
            status: AirbyteConnectionStatus.SUCCEEDED,
            message: 'Setup-time check skipped (check_connection=false)',
          });
          this.logger.write(status);
          return;
        }

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
          this.logNodeOptions('Source');
          const initialConfig = require(path.resolve(opts.config));
          const config = await this.source.onBeforeRun(initialConfig);
          const catalog = require(path.resolve(opts.catalog));
          const spec = addSourceCommonProperties(await this.source.spec());
          const redactedConfig = redactConfig(config, spec);
          this.logger.info(`Source version: ${ConnectorVersion}`);
          this.logger.info(`Config: ${JSON.stringify(redactedConfig)}`);
          this.logger.info(`Catalog: ${JSON.stringify(catalog)}`);

          let state: AirbyteState | undefined = undefined;
          if (opts.state) {
            state = require(path.resolve(opts.state));
            this.logger.info(`State: ${JSON.stringify(state)}`);
          }

          try {
            // Call onBeforeRead FIRST to get the final config that will be used
            // This ensures that any singletons initialized during the pre-read check
            // are created with the config returned by onBeforeRead (e.g., requestedStreams)
            const res = await this.source.onBeforeRead(
              config,
              catalog,
              Data.decompress(state)
            );

            // Always perform pre-read connection validation with the FINAL config
            // This ensures singletons are initialized with the final config
            this.logger.info('Performing pre-read connection validation');
            const checkStatus = await this.source.check(res.config);
            if (
              checkStatus.connectionStatus.status ===
              AirbyteConnectionStatus.FAILED
            ) {
              this.logger.error(
                `Pre-read connection check failed: ${checkStatus.connectionStatus.message}`
              );
              this.logger.write(checkStatus);
              this.logger.flush();
              throw new Error(
                `Pre-read connection check failed: ${checkStatus.connectionStatus.message}`
              );
            }
            this.logger.info('Pre-read connection validation succeeded');

            const clonedState = Data.decompress(cloneDeep(res.state ?? {}));
            this.logger.getState = () =>
              maybeCompressState(res.config, clonedState);
            const iter = this.source.read(
              res.config,
              redactConfig(res.config, spec),
              res.catalog,
              clonedState
            );
            for await (const message of iter) {
              this.logger.write(message);
            }
            await this.source.onAfterRead(res.config);
          } catch (e: any) {
            const w = wrapApiError(e);
            const s = JSON.stringify(w);
            this.logger.error(
              `Encountered an error while reading from source: ${w} - ${s}`,
              w.stack
            );
            this.logger.flush();
            throw e;
          } finally {
            this.logger.flush();
          }
        }
      );
  }

  specPrettyCommand(): Command {
    return new Command()
      .command('spec-pretty')
      .description('pretty spec command')
      .action(async () => {
        const spec = addSourceCommonProperties(await this.source.spec(false));
        const rows = traverseObject(
          spec.spec.connectionSpecification,
          [
            // Prefix argument names with --src
            '--src',
          ],
          // Assign section = 0 to the root object's row, which
          // will be removed, so that the remaining rows are
          // numbered 1..N
          0
        );
        // Drop the first row since it corresponds to the root
        // (connectionSpecification) object
        rows.shift();
        console.log(helpTable(rows));
      });
  }

  airbyteLocalCLIWizardCommand(): Command {
    return new Command()
      .command('airbyte-local-cli-wizard')
      .option(
        '--json <path to json>',
        'Output the source configuration as JSON'
      )
      .option(
        '--spec-file <path to spec>',
        'Path to the spec file. If not provided, the spec will be fetched from the source'
      )
      .option(
        '--include-deprecated-fields',
        'Include fields marked as deprecated in the spec',
        false
      )
      .option(
        '--include-hidden-fields',
        'Include fields marked as hidden in the spec',
        false
      )
      .option(
        '--autofill',
        'Automatically fill in the source configuration with default/placeholder values',
        false
      )
      .description(
        'Run a wizard command to prepare arguments for Airbyte Local CLI'
      )
      .action(async (opts) => {
        const spec = opts.specFile
          ? JSON.parse(fs.readFileSync(opts.specFile, 'utf8'))
          : addSourceCommonProperties(await this.source.spec(false));
        const rows = traverseObject(
          spec.spec.connectionSpecification,
          opts.json
            ? []
            : [
                // Prefix argument names with --src
                '--src',
              ],
          // Assign section = 0 to the root object's row
          0,
          opts.includeDeprecatedFields,
          opts.includeHiddenFields
        );

        if (opts.json) {
          fs.writeFileSync(opts.json, await buildJson(rows, opts.autofill));
        } else {
          console.log(
            '\n\nUse the arguments below when running this source' +
              ' with Airbyte Local CLI (https://github.com/faros-ai/airbyte-local-cli):' +
              `\n\n${await buildArgs(rows, opts.autofill)}`
          );
        }
      });
  }
}
