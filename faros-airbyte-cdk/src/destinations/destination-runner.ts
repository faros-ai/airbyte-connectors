/* eslint-disable @typescript-eslint/no-var-requires */

import {Command} from 'commander';
import fs from 'fs';
import path from 'path';

import {wrapApiError} from '../errors';
import {buildArgs, buildJson, helpTable, traverseObject} from '../help';
import {AirbyteLogger} from '../logger';
import {AirbyteConfig, AirbyteSpec} from '../protocol';
import {ConnectorVersion, Runner} from '../runner';
import {PACKAGE_VERSION, redactConfig, withDefaults} from '../utils';
import {AirbyteDestination} from './destination';

export class AirbyteDestinationRunner<
  Config extends AirbyteConfig,
> extends Runner {
  constructor(
    protected readonly logger: AirbyteLogger,
    protected readonly destination: AirbyteDestination<Config>
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
          this.logNodeOptions('Destination');
          const {catalog, spec, config} = await this.loadConfig(opts);
          const redactedConfig = redactConfig(config, spec);
          this.logger.info(`Destination version: ${ConnectorVersion}`);
          this.logger.info(`Config: ${JSON.stringify(redactedConfig)}`);
          this.logger.info(`Catalog: ${JSON.stringify(catalog)}`);

          try {
            process.stdin.setEncoding('utf-8');

            const iter = this.destination.write(
              config,
              redactedConfig,
              catalog,
              process.stdin,
              opts.dryRun
            );
            for await (const message of iter) {
              this.logger.write(message);
            }
          } catch (e: any) {
            const w = wrapApiError(e);
            const s = JSON.stringify(w);
            this.logger.error(
              `Encountered an error while writing to destination: ${w} - ${s}`,
              w.stack
            );
            throw e;
          } finally {
            process.stdin.destroy();
          }
        }
      );
  }

  specPrettyCommand(): Command {
    return new Command()
      .command('spec-pretty')
      .description('pretty spec command')
      .action(async () => {
        const spec = await this.destination.spec(false);
        const rows = traverseObject(
          spec.spec.connectionSpecification,
          [
            // Prefix argument names with --dst
            '--dst',
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
        'Output the destination configuration as JSON'
      )
      .option(
        '--spec-file <path to spec>',
        'Path to the spec file. If not provided, the spec will be fetched from the destination'
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
        'Automatically fill in the destination configuration with default/placeholder values',
        false
      )
      .description(
        'Run a wizard command to prepare arguments for Airbyte Local CLI'
      )
      .action(async (opts) => {
        const spec = opts.specFile
          ? JSON.parse(fs.readFileSync(opts.specFile, 'utf8'))
          : await this.destination.spec(false);
        const rows = traverseObject(
          spec.spec.connectionSpecification,
          opts.json
            ? []
            : [
                // Prefix argument names with --dst
                '--dst',
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
            '\n\nUse the arguments below when running this destination' +
              ' with Airbyte Local CLI (https://github.com/faros-ai/airbyte-local-cli):' +
              `\n\n${await buildArgs(rows, opts.autofill)}`
          );
        }
      });
  }

  private async loadConfig(opts: {
    config: string;
    catalog: string;
    dryRun: boolean;
  }): Promise<{catalog: any; spec: AirbyteSpec; config: Config}> {
    try {
      const catalog = require(path.resolve(opts.catalog));
      const spec = await this.destination.spec();
      const config = withDefaults(require(path.resolve(opts.config)), spec);
      return {catalog, spec, config};
    } catch (e: any) {
      const w = wrapApiError(e);
      const s = JSON.stringify(w);
      this.logger.error(
        `Encountered an error while loading configuration: ${w} - ${s}`,
        w.stack
      );
      throw e;
    }
  }
}
