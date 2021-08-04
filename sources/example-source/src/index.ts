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
    .addCommand(readCommand());
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

function newBuild(idx: number): any {
  return {
    uid: 'uid' + idx,
    source: 'Jenkins',
    fields: {
      command: 'command ' + idx,
      number: Date.now(),
    },
    additional_fields: [
      {
        name: 'key' + idx,
        value: Date.now(),
        nested: {
          value: 'nested' + idx,
        },
      },
      {
        name: 'static',
        value: 'static',
        nested: {
          value: 'static',
        },
      },
    ],
  };
}

function writeBuild(build: any): void {
  console.log(
    JSON.stringify({
      type: 'RECORD',
      record: {
        stream: 'jenkins_builds',
        data: build,
        emitted_at: Date.now(),
        namespace: 'faros',
      },
    })
  );
}

function readCommand(): commander.Command {
  return new Command()
    .command('read')
    .description('read command')
    .alias('r')
    .requiredOption('--config <path to json>', 'config json')
    .requiredOption('--catalog <path to json>', 'catalog json')
    .option('--state <path to json>', 'state json')
    .action((opts: {config: string; catalog: string; state?: string}) => {
      const config = require(path.resolve(opts.config));
      const catalog = require(path.resolve(opts.catalog));
      log('config: ' + JSON.stringify(config));
      log('catalog: ' + JSON.stringify(catalog));
      if (opts.state) {
        const state = require(path.resolve(opts.state));
        log('prev state: ' + JSON.stringify(state));
      }
      log('Syncing stream: jenkins_builds');
      const numBuilds = 5;
      for (let i = 0; i < numBuilds; i++) {
        // Write record to be consumed by destination
        writeBuild(newBuild(i));
      }
      log(`Synced ${numBuilds} records from stream jenkins_builds`);

      // Write state for next sync
      writeState({cutoff: Date.now()});
    });
}
