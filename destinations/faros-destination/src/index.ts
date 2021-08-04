import commander, {Command} from 'commander';
import path from 'path';
import {Dictionary} from 'ts-essentials';

import {PACKAGE_VERSION} from './utils';

/** The main entry point. */
export function mainCommand(): commander.Command {
  return new Command()
    .name('main')
    .version('v' + PACKAGE_VERSION)
    .addCommand(specCommand())
    .addCommand(checkCommand())
    .addCommand(discoverCommand())
    .addCommand(writeCommand());
}

function specCommand(): commander.Command {
  return new Command()
    .command('spec')
    .description('spec command')
    .alias('s')
    .action(() => {
      const spec = require('../resources/spec.json');

      // Expected output
      console.log(JSON.stringify(spec));
    });
}

function checkCommand(): commander.Command {
  return new Command()
    .command('check')
    .description('check command')
    .alias('c')
    .requiredOption('--config <path to json>', 'config json')
    .action((opts: {config: string}) => {
      const config = require(path.resolve(opts.config));
      const status = config.user === 'chris' ? 'SUCCEEDED' : 'FAILED';
      const result = {
        type: 'CONNECTION_STATUS',
        connectionStatus: {
          status,
        },
      };

      // Expected output
      console.log(JSON.stringify(result));
    });
}

function discoverCommand(): commander.Command {
  return new Command()
    .command('discover')
    .description('discover command')
    .alias('d')
    .requiredOption('--config <path to json>', 'config json')
    .action(() => {
      const catalog = require('../resources/catalog.json');

      // Expected output
      console.log(
        JSON.stringify({
          type: 'CATALOG',
          catalog,
        })
      );
    });
}

// Write a logging message. Surfaced in Airbyte sync logs
function log(message: string, level = 'INFO'): void {
  console.log(
    JSON.stringify({
      type: 'LOG',
      log: {
        level,
        message,
      },
    })
  );
}

// Write state to be automatically saved by Airbyte
function writeState(state: Dictionary<any>): void {
  console.log(
    JSON.stringify({
      type: 'STATE',
      state: {
        data: state,
      },
    })
  );
}

function writeCommand(): commander.Command {
  return new Command()
    .command('write')
    .description('write command')
    .alias('w')
    .requiredOption('--config <path to json>', 'config json')
    .requiredOption('--catalog <path to json>', 'catalog json')
    .action((opts: {config: string; catalog: string}) => {
      const config = require(path.resolve(opts.config));
      const catalog = require(path.resolve(opts.catalog));
      log('config: ' + JSON.stringify(config));
      log('catalog: ' + JSON.stringify(catalog));

      // Write state for next sync
      writeState({cutoff: Date.now()});
    });
}
